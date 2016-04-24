var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

var socket;
var peers = {};
var files = {};
var received_files = {};
var server = {

  iceServers: [
    {url: "stun:23.21.150.121"},
    {url: "stun:stun.l.google.com:19302"}
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
          socket.emit('login', {name: name})          
        }
        
        socket.on('login', function(data){
          var current_name = data.name;
          
          if(data.state === 'taken'){
            alert('Пльзователь с таким ником уже находится в чате');
          }else if(data.name != undefined){
            console.log('Успешно зашли в чат');            
            
            $('.nicknames').append('<div>' + data.name + '</div>');
            $('.chat').append('Известные мне проблемы чата:<br> 1. Чат не будет работать если оба\
            пользователя находятся за NAT\'ом из-за отсутствия TURN сервера.<br>\
            2. При передаче больших файлов(>100 мб) иногда падает канал.<br>\
            3. Поехала верстка в файрфоксе.<br>\
            4. Не всегда работает прием файлов в файрфоксе :(\
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
            	initConn(pc, data.name, current_name, "offer");
              
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
              createConnection(data.from, current_name);
              var pc = peers[data.from].connection;
	            pc.addIceCandidate(new IceCandidate(data.candidate));
            });
            
            socket.on('offer', function(data){ //name,localDescription
                console.log('receive offer from ', data.from);
                
                createConnection(data.from, current_name);
                
                var pc = peers[data.from].connection;
                
                pc.setRemoteDescription(new SessionDescription(data.localDescription));
                 
                pc.createAnswer(function(answer) {                  
                  pc.setLocalDescription(answer);
                  console.log('answer created');
                },function(err){
                  console.log(err);
                });
            });
            
            socket.on('answer', function(data){   
              console.log('receive answer from ', data.from);       
              var pc = peers[data.from].connection;
	            pc.setRemoteDescription(new SessionDescription(data.localDescription));
            });
          }else{
              alert('Ошибка при логине');
              location.reload();
          }
        });
        
        $('.chatForm').on('submit', function(e){
          e.preventDefault();
          var msg = $('.chat-text').val();
                    
            
          msgSend('message', msg, 'all');
        
          //Скроллим чат
          var height = $('.chat')[0].scrollHeight;
          $('.chat').scrollTop(height);
          
          
        });
        
        //Отправка файла
        var fileInput = document.getElementById('fileInput');
        var fReader = new FileReader();

        fReader.onload = function(e) {
          var file = document.getElementById('fileInput').files[0];
          files[file.name] = {
            id: Math.random().toString().slice(5,11),//6 рандомных цифр
            name: file.name,
            size: file.size,
            type: file.type,
            lastMod: file.lastModifiedDate,
            content: e.target.result
          };
          //Отправляем запрос на скачивание файла
          msgSend('fileSend', files[file.name], 'all');
        }

        fileInput.onchange = function(e) {  
            var file = this.files[0];          
            fReader.readAsArrayBuffer(file);
        }

      });      
      
 });
      

function msgSend(type, data, to){ 
 if(type === 'message' && data != ''){
   //Показываем сообщения у текущего пользователя
   $('.chat').append("<div>Вы: " + data + "</div>");
   $('.chat-text').val('');
   var msg = '000001' + data;    
 }
 if(type === 'fileSend' && data.size >= 0){
   //Показываем сообщения у текущего пользователя
   $('.chat').append("<div>Вы отправили запрос на скачивание файла " + data.name + " всем пользователям.</div>");
   $('.chat-text').val('');
    //Отправляем запрос на скачивание всем пирам
    var msg = '000002' + JSON.stringify(data);    
 }
 if(type === 'acceptFile'){
   var msg = '000003' + data;
 }
 
 if(to === 'all'){
 //Отправляем сообщение всем пирам
    for (var peer in peers) {
      if (peers.hasOwnProperty(peer)) {
        if (peers[peer].channel !== undefined) {
          try {
             peers[peer].channel.send(msg);
           } catch (e) {
              console.log(e);
           }
         }
       }
     }
   }else{
     if(peers[to] != null){
      try{
        peers[to].channel.send(msg);
      }catch(e){
        console.log(e);
      }       
     }
   }
}
        
function bindEvents (channel) {
	channel.onopen = function () {
    //TODO добавить в список пользоавтелей channel.owner
    $('.nicknames').append('<div>' + channel.owner + '</div>');
    console.log('connection open');
	};
	channel.onmessage = function (e) {
    //Если мы получили текстовое сообщение, запрос скачать или отправить файл
    if(typeof(e.data) === 'string'){
      if(e.data.substr(0, 6) === '000001'){ // сообщение
        console.log('Получили текстовое сообщение');
        //Показываем сообщения у текущего пользователя
        var msg = e.data.substr(6, e.data.length);
        $('.chat').append('<div>' + e.currentTarget.owner + ': ' + msg + '</div>');
        
        //Скроллим чат
        var height = $('.chat')[0].scrollHeight;
        $('.chat').scrollTop(height);
        
      }else if(e.data.substr(0, 6) === '000002'){// запрос на скачивание файла
        console.log('Запрос на скачивание файла от', channel.owner);
        var json_msg = e.data.substr(6, e.data.length);
        var data = JSON.parse(json_msg);
        
        //Сохраняем метаинформацию о принимаемом файле
        received_files[data.id] = {
          name: data.name,
          size: data.size,
          type: data.type,
          content: new ArrayBuffer(0),
          receivedChunks: 0,
          totalChunks:  (data.size/16384),
          from: channel.owner
        }
        
        
        $('.chat').append('<div>' + e.currentTarget.owner + ': <a href="#" onclick="acceptFile(\'' + data.name + '\',\'' + channel.owner + '\')">' + data.name + '</a></div>');
      
    }else if(e.data.substr(0, 6) === '000003'){//Запрос на отправку файла
        //Отправляем запрошеный файл, если он есть
        console.log('Получили запрос на отправку файла');
        var filename = e.data.substr(6, e.data.length);
        var to = channel.owner;
        
        if (files[filename].size === 0) {
          alert('Файл пустой.Не удалось передать файл пользователю ', to);
          return;
        }else if(files[filename].size > 0 && peers[to].channel !== undefined){
          sendFile(files[filename], to);
        }     
      }     
    }else if(typeof(e.data) === 'object'){
        //Поулчаем мета информацию
        var meta = e.data.slice(0,36);
        var full_meta = ab2str(meta);
        var chunk = full_meta.slice(0,6);
        var total_chunks = full_meta.slice(6,12);
        var id =  full_meta.slice(12,18);
        var data = e.data.slice(36,e.data.length);
        var content = received_files[id].content;
        
        if(content != undefined){
          received_files[id].content = concatBuffers(content,data);
        }
        
        //Если последний чанк - сохраняем файл
        if(parseInt(chunk) + 1 === parseInt(total_chunks)){
          saveByteArrayToFile(received_files[id].content, received_files[id].name);          
        }
    }
	};
}
function saveByteArrayToFile(data, name) {
   var a = document.createElement("a");
   document.body.appendChild(a);
   var blob = new Blob([data], {type: "octet/stream"}),
   url = window.URL.createObjectURL(blob);
   a.href = url;
   a.download = name;
   a.click();
   window.URL.revokeObjectURL(url);
};
    
function sendFile(file,to){
  //Отправляем бинарные данные в формате:
  // chunk   total_chunks   file_id        binary_data
  //0000001     0000001     0000001    00000000000000000000....
  chunkSize = 16384-36; //36 - дополнительная информация о файле
  var total_chunks = Math.ceil(file.content.byteLength/chunkSize);
  total_chunks =  leftPadWithZeros(total_chunks,6);
  var id = leftPadWithZeros(file.id,6);
  for(var i = 0; i < file.content.byteLength; i = i + chunkSize){
    var chunk = leftPadWithZeros((i/chunkSize),6);
    var meta = chunk + total_chunks + id
    var meta_data =  str2ab(meta);
    var binary_data = file.content.slice(i, i + chunkSize);
    
    var data_to_send = concatBuffers(meta_data,binary_data);
    try{
        //TODO иногда при отправке больших файлов падает канал, нужно подымать его по новой 
        //и повторять отправку недоставленных чанков
        peers[to].channel.send(data_to_send);
      }catch(e){
        console.log(e);
      }          
  }
}

function concatBuffers(buffer1, buffer2) {
  var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
};

function leftPadWithZeros(number, length){
    var str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

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

function acceptFile(filename, owner){
  msgSend('acceptFile', filename, owner);
}

function createConnection(name, current_name){
   //Инициализируем подключение если его нет
  if (peers[name] === undefined){
    peers[name] = {
      cache: []
    };
    
    var pc = new PeerConnection(server, options);
    
    initConn(pc, name, current_name, 'answer');
    
    peers[name].connection = pc;
    pc.ondatachannel = function(e) {
      peers[name].channel = e.channel;
      peers[name].channel.owner = name;
      bindEvents(peers[name].channel);
    }
  }
}

function initConn(pc, name, current_name, sdpType) {
	pc.onicecandidate = function (event) {
		if (event.candidate) {
			// При обнаружении нового ICE кандидата добавляем его в список для дальнейшей отправки
			peers[name].cache.push(event.candidate);
		} else {
			// Когда обнаружение кандидатов завершено, обработчик будет вызван еще раз, но без кандидата
			// В этом случае мы отправялем пиру сначала SDP offer или SDP answer (в зависимости от SDP запроса)
      
			socket.emit(sdpType, {to: name, from: current_name, localDescription: pc.localDescription});
      
			// ...а затем все найденные ранее ICE кандидаты
			for (var i = 0; i < peers[name].cache.length; i++) {
        socket.emit("candidate", {to: name, from: current_name, candidate: peers[name].cache[i]});
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