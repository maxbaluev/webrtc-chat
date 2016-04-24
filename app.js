var app = require('express')();
var server = require('http').createServer(app);

var virtualDirPath = process.env.virtualDirPath || '';
var io = require('socket.io')(server)//(server, { path: virtualDirPath + '/socket.io' });
var users = {};

server.listen(process.env.PORT || 8080, function () {
  console.log('Подняли сервер на *:8080');
});

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});
app.get('/style.css', function (req, res) {
  res.sendFile(__dirname + '/style.css');
});
app.get('/index.js', function (req, res) {
  res.sendFile(__dirname + '/index.js');
});

io.on('connection', function (socket) {  
    
    socket.on('login', function(data){
        console.log('Зашел пользователь:', data.name);
        
        //Не даем подключиться если пользователь уже в чате
        if(users[data.name]) { 
            socket.emit('login', {state: 'taken'});           
        }else{
            socket.name = data.name;
            users[data.name] = socket;
            socket.broadcast.emit('newuser', {name: data.name});
            socket.emit('login', {name: data.name}); 
        }
    });
    
    //format offer
    socket.on('offer', function(data){//data.name, data.localDescription
        console.log('Поулчили offer для:', data.to);
        users[data.to].emit("offer", data);
    });   
    
    socket.on('answer', function(data){//data.name, data.localDescription
        console.log('Поулчили answer для:', data.to);
        users[data.to].emit("answer", data);
    });
    
    socket.on('candidate', function(data){//data.name, data.candidate
        console.log('Поулчили candidate для:', data.to);
        users[data.to].emit("candidate", data);
    }); 
    
    socket.on('disconnect', function (data) {
        console.log('disconnected:',socket.name);
        //io.emit('user disconnected',data.to);
        //io.sockets.emit('quit', {name: data.from}) 
        delete users[socket.name]; 
    });
    
});