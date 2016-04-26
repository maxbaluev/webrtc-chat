var PeerConnection = window.RTCPeerConnection;
var PeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var SessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
var IceCandidate = window.RTCIceCandidate;


var socket;
var peers = {};
var files = {};
var receivedFiles = {};

//Настройки PeerConnection
var server = {
  iceServers: [
    {urls: "stun:23.21.150.121"},
    {urls: "stun:stun.l.google.com:19302"}
  ]
};
var options = {
  optional: [
    {DtlsSrtpKeyAgreement: true}, // требуется для соединения между Chrome и Firefox
    //{RtpDataChannels: true} // FCK!!!!!!!!!!
  ]
}

 $(document).ready(function () { 
      $('.chat').css({'height':($(document).height() - $('.chat-input').height() - 60)+'px'});   
      $('#login-modal').modal('show');
      
       //Логинимся.  
      $('#loginForm').on('submit', function(e) {
        e.preventDefault();
        var name = $('input[name=username]').val();
        
        if (!name) {
          alert('Вы не ввели логин');
          return;
        }else{
          //подключаемся к сигнальному серверу
          socket = io.connect('/', {
            forceNew: true
          });
          socket.emit('login', {name: name});       
        }
        
        socket.on('login', function(data){
          var currentName = data.name;
          
          if(data.state === 'taken'){
            alert('Пльзователь с таким ником уже находится в чате');
          }else if(data.name != undefined){
            console.log('Успешно зашли в чат');            
            
            $('.nicknames').append('<div>' + data.name + '</div>');
            $('.chat').append('Известные мне проблемы чата:<br> 1. Чат не будет работать если оба\
            пользователя находятся за NAT\'ом из-за отсутствия TURN сервера.<br>\
            2. При передаче больших файлов(>100 мб) иногда падает канал.<br>\
            3. Поехала верстка в файрфоксе.<br>\
            4. Не работает прием пакетов в файрфоксе :(<br>\
            Посмотреть исходники можно <a target="_blank" href="https://github.com/maxbaluev/webrtc-chat">тут</a>.');
            
            //Скрываем форму логина
            $('#login-modal').modal('toggle');
            $('.content').css('display','block');
            
            socket.on('newuser', function(data){
              console.log('receive newuser ', data.name);
              peers[data.name] = {
                cache: []
              };              
              
              // Создаем новое подключение
	            var pc = new PeerConnection(server, options);
              
              // Инициализируем его
              initConn(pc, data.name, currentName, "offer");
              
              // Сохраняем пир в списке
              peers[data.name].connection = pc;
              
              // Создаем DataChannel по которому и будет происходить обмен сообщениями
              var channel = pc.createDataChannel("chatchannel", {});
              channel.owner = data.name;
              peers[data.name].channel = channel;
              
              // Устанавливаем обработчики событий канала
              bindEvents(channel);
              
              // Создаем SDP offer
              pc.createOffer(function(offer) {
                console.log('Установили локальный дескрипшен');
                pc.setLocalDescription(offer);
              },function(err){
                console.log(err);
              });             
            });
            
            socket.on('candidate', function(data){
              console.log('receive candidate from ', data.from);
              createConnection(data.from, currentName);
              var pc = peers[data.from].connection;
	            pc.addIceCandidate(new IceCandidate(data.candidate));
            });
            
            socket.on('offer', function(data){ //name,localDescription
                console.log('receive offer from ', data.from);
                
                createConnection(data.from, currentName);
                
                if(peers[data.from].connection !== undefined){  
                    var pc = peers[data.from].connection;
                    
                    pc.setRemoteDescription(new SessionDescription(data.localDescription));
                    
                    pc.createAnswer(function(answer) {                  
                    pc.setLocalDescription(answer);
                    console.log('answer created');
                    },function(err){
                    console.log(err);
                    });
                }
            });
            
            socket.on('answer', function(data){   
              console.log('receive answer from ', data.from); 
              if(peers[data.from].connection !== undefined){     
                var pc = peers[data.from].connection;
              }
              pc.setRemoteDescription(new SessionDescription(data.localDescription));
            });
          }else{
              alert('Ошибка при логине');
              location.reload();
          }
        });
        
        
        
        //Ввод пользователя
        $('.chatForm').on('submit', function(e){
          e.preventDefault();
          var msg = $('.chat-text').val();
                    
            
          msgSend('message', msg, 'all');
        
          //Скроллим чат
          var height = $('.chat')[0].scrollHeight;
          $('.chat').scrollTop(height);
        });       
        
        //Отправка файла при загрузке его в форму
        var fileInput = document.getElementById('fileInput');
        var fReader = new FileReader();

        fReader.onload = function(e) {
          var file = document.getElementById('fileInput').files[0];
          var id = Math.random().toString().slice(5,11);
          files[id] = {
            id: id,//6 рандомных цифр
            name: file.name,
            size: file.size,
            content: e.target.result
          };
          //Отправляем запрос на скачивание файла
          msgSend('fileSend', files[id], 'all');
        }

        fileInput.onchange = function(e) {  
            var file = this.files[0];          
            fReader.readAsArrayBuffer(file);
        }
        
        

      });      
      
//Закрываем каналы при отключении
window.addEventListener("beforeunload", onBeforeUnload);
    function onBeforeUnload(e) {
        for (var peer in peers) {
            if (peers.hasOwnProperty(peer)) {
                if (peers[peer].channel !== undefined) {
                    try {
                        peers[peer].channel.close();
                    } catch (e) {}
                }
            }
        }
    }
});      


//События канала
function bindEvents (channel)  {
	channel.onopen = function () {
        //Добавляем в список пользователей владельца канала.
        $('.nicknames').append('<div>' + channel.owner + '</div>');
        console.log('Открыто соединение');
        };
	channel.onmessage = function (e) {
        msgReceive(e);
	}
    channel.onerror = function(err) {
        console.log('Ошибка канала:', err);
    };
 }
//Инициализируем подключение если его нет
function createConnection(name, currentName){
  if (peers[name] === undefined){
    peers[name] = {
      cache: []
    };    
    var pc = new PeerConnection(server, options);
    
    initConn(pc, name, currentName, 'answer');
    
    peers[name].connection = pc;
    pc.ondatachannel = function(e) {
      peers[name].channel = e.channel;
      peers[name].channel.owner = name;
      bindEvents(peers[name].channel);
    }
  }
}
function initConn(pc, name, currentName, sdpType) {
	pc.onicecandidate = function (event) {
		if (event.candidate) {
			// При обнаружении нового ICE кандидата добавляем его в список для дальнейшей отправки
			peers[name].cache.push(event.candidate);
		} else {
			// Когда обнаружение кандидатов завершено, обработчик будет вызван еще раз, но без кандидата
			// В этом случае мы отправялем пиру сначала SDP offer или SDP answer (в зависимости от SDP запроса)
      
			socket.emit(sdpType, {to: name, from: currentName, localDescription: pc.localDescription});
      
			// ...а затем все найденные ранее ICE кандидаты
			for (var i = 0; i < peers[name].cache.length; i++) {
        socket.emit("candidate", {to: name, from: currentName, candidate: peers[name].cache[i]});
			}
		}
	}
  
	pc.oniceconnectionstatechange = function (event) {
		if (pc.iceConnectionState == "disconnected") {
      //Пир отключился удаляем из списка юзеров  
      console.log('Отключился пользователь:', name)
      $('.nicknames').find('div:contains("' + name + '")').remove();
			delete peers[name];
		}
	}
}


//Протокол передачи сообщений
function msgSend(type, data, to){
  //Отправляем все сообщения как ArrayBuffer в следующем формате
  // msgType(6 bytes)   currentChunk(12 bytes)   totalChunks(12 bytes)   transferId(12 bytes)      message(16342 bytes max)       =   16384
  //       001            000001                     000001               000000                   Text message or bufferArray
  
  if(type === 'message' && data != ''){
    //Показываем сообщения у текущего пользователя
    $('.chat').append("<div>Вы: " + data + "</div>");
    $('.chat-text').val('');
    
    var currentChunk = 0;
    var totalChunks = Math.ceil(data.length/8171);
    if(data.length > 8171){
      for(var i = 0; i < data.length; i = i + 8171){
        var dataToSend = data.slice(i,( i + 8171 ));
        var dataPacket = createPacket('message', ++currentChunk, totalChunks, '000000', dataToSend);
        sendPacket(dataPacket, to);
      }
    }else{
      var dataPacket = createPacket('message', ++currentChunk, totalChunks, '000000', data);
      sendPacket(dataPacket, to);
    }
    console.log('Отправили текстовое сообщение всем пирам');
  }   
  if(type === 'fileSend' && data.size >= 0){
    //Показываем сообщения у текущего пользователя
    $('.chat').append("<div>Вы отправили запрос на скачивание файла " + data.name + " всем пользователям.</div>");
    $('.chat-text').val('');
    //Отправляем запрос на скачивание всем пирам
    var dataPacket = createPacket('fileSend', '1', '1', '000000', JSON.stringify(data));
    sendPacket(dataPacket, to);
    console.log('Отправили запрос на скачивание файла всем пирам');
  } 
  if(type === 'acceptFile'){
    //Отправляем запрос на согласие скачивания
    var dataPacket = createPacket('acceptFile', '1', '1', '000000', data);
    sendPacket(dataPacket, to);
    console.log('Отправили согласие на загрузку файла пользователю', to);
  } 
  if(type === 'file'){
    //Отправляем файл    
    var currentChunk = 0;
    var chunkSize = 16384-42; //42 - мета информация о файле
    var totalChunks = leftPadWithZeros( Math.ceil(data.content.byteLength/chunkSize), 6 );
    var id = data.id;
    
    for(var i = 0; i < data.content.byteLength; i = i + chunkSize){
      var binaryData = data.content.slice(i, i + chunkSize);  
      var dataPacket = createPacket('file', ++currentChunk, totalChunks, id, binaryData);
      sendPacket(dataPacket, to);           
    }
    console.log('Отправили файл пользователю', to);
  } 
}
function msgReceive(e){
    //Получили пакет будем его парсить
    // msgType(6 bytes)   currentChunk(12 bytes)   totalChunks(12 bytes)   transferId(12 bytes)      message(16342 bytes max)       =   16384
  
    var msgType = ab2str( e.data.slice(0, 6));
    var currentChunk = ab2str( e.data.slice(6, 18));
    var totalChunks = ab2str( e.data.slice(18, 30));
    var transferId = ab2str( e.data.slice(30, 42));
    var message = e.data.slice(42, e.data.byteLength);
    
    if(msgType === '001'){
      console.log('Получили текстовое сообщение');
      //Показываем сообщения у текущего пользователя
      var msg = ab2str(message);
      $('.chat').append('<div>' + e.currentTarget.owner + ': ' + msg + '</div>');
        
      //Скроллим чат
      var height = $('.chat')[0].scrollHeight;
      $('.chat').scrollTop(height);  
    }else if(msgType === '002'){
      console.log('Запрос на скачивание файла от', e.currentTarget.owner);
        var msg = ab2str(message);
        var data = JSON.parse(msg);
        
        //Сохраняем мета информацию о принимаемом файле
        receivedFiles[data.id] = {
          id: data.id,
          name: data.name,
          size: data.size,
          content: new ArrayBuffer(0),
          from: channel.owner
        }
        
        //При клике по ссылке - отправляем запрос на скаичвание файла
        $('.chat').append('<div>' + e.currentTarget.owner + ': <a href="#" onclick="msgSend(\'acceptFile\',\'' + data.id + '\',\'' + e.currentTarget.owner + '\')">' + data.name + '</a></div>');
    }else if(msgType === '003'){
      //Отправляем запрошеный файл, если он есть
       console.log('Получили запрос на отправку файла от', e.currentTarget.owner);
       var fileId = ab2str(message);
       var to = e.currentTarget.owner;
       console.log(fileId);
       
       if (files[fileId].size === 0) {
         alert('Файл пустой.Не удалось передать файл пользователю ', to);
         return;
       }else if(files[fileId].size > 0 && peers[to].channel !== undefined){
         msgSend('file', files[fileId], to);
       }
    }else if(msgType === '004'){
      //Принимаем чанк только если есть ожидаемый файл и мы не принимали чанк раньше
      var content = receivedFiles[transferId].content;
      if(parseInt(currentChunk) === 1){
        var checkLength = 1;
      }else if(parseInt(currentChunk) > 1 && message.byteLength < 16342){
        var checkLength = (parseInt(currentChunk) - 1)*16342 + message.byteLength + 1;
      }else{
        var checkLength = parseInt(currentChunk)*16342 + 1;
      }      
      if(content !== undefined && content.byteLength < checkLength){
        receivedFiles[transferId].content = concatBuffers(content,message);
      }
      //Если последний чанк - сохраняем файл
      if(parseInt(currentChunk) === parseInt(totalChunks)){
        saveByteArrayToFile(receivedFiles[transferId].content, receivedFiles[transferId].name);          
      }        
    }
}
function createPacket(msgType, currentChunk, totalChunks, transferId, message){ 
  if(msgType === 'message'){
    var msgTypeBytes =  str2ab('001');
    var msgBytes = str2ab(message);
  }else if(msgType === 'fileSend'){
    var msgTypeBytes =  str2ab('002');
    var msgBytes = str2ab(message);
  }else if(msgType === 'acceptFile'){
    var msgTypeBytes =  str2ab('003');
    var msgBytes = str2ab(message);
  }else if(msgType === 'file'){
    var msgTypeBytes =  str2ab('004');
    var msgBytes = message;
  }
  
  var currentChunkBytes = str2ab(leftPadWithZeros(currentChunk, 6));
  var totalChunksBytes = str2ab(leftPadWithZeros(totalChunks, 6));
  var transferIdBytes =  str2ab(transferId); 
  
  return concatFiveBuffers(msgTypeBytes, currentChunkBytes, totalChunksBytes, transferIdBytes, msgBytes);
}
function sendPacket(dataPacket, to){
  //TODO иногда при отправке больших файлов падает канал, нужно подымать его по новой 
  //и повторять отправку недоставленных чанков  
  if(to === 'all'){
  //Отправляем сообщение всем пирам
    for (var peer in peers) {
      if (peers.hasOwnProperty(peer)) {
        if (peers[peer].channel !== undefined) {
          try {
             peers[peer].channel.send(dataPacket);
           } catch (e) {
              console.log(e);
           }
         }
       }
     }
   }else{
     if(peers[to] != null){
      try{
        peers[to].channel.send(dataPacket);
      }catch(e){
        console.log(e);
      }       
     }
   }   
}

//Вспомогательные функции
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}
function str2ab(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}
function leftPadWithZeros(number, length){
    var str = '' + number;
    while (str.length < length){
        str = '0' + str;
    }
    return str;
}
function concatFiveBuffers(buffer1, buffer2, buffer3, buffer4, buffer5) {
  var tmpBuffer = concatBuffers(buffer1, buffer2);
  var tmpBuffer = concatBuffers(tmpBuffer, buffer3);
  var tmpBuffer = concatBuffers(tmpBuffer, buffer4);
  var tmpBuffer = concatBuffers(tmpBuffer, buffer5);  
  return tmpBuffer;
};
function concatBuffers(buffer1, buffer2){
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};
function saveByteArrayToFile(data, name) {
   var a = document.createElement("a");
   document.body.appendChild(a);
   var blob = new Blob([data], {type: "octet/stream"}),
   url = window.URL.createObjectURL(blob);
   a.href = url;
   a.download = name;
   a.click();
   window.URL.revokeObjectURL(url);
}
