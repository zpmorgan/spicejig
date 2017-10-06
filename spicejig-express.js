var config;
var path = require('path');

try {
  config = require('./config.json')
  console.log('loading config.json');
} catch (ex) {
  console.log('config not found. enabling dev mode.');
  config = {
    secret: 'lkasjdhfgkjlhafdgiludfha98fha98hf9agh',
    env: 'dev',
  }
}

var express = require('express');
var app = express();

//static directories
if (config.env === 'dev'){
  app.use('/skrpt', express.static(__dirname + '/lib'));
  //app.use('/js', express.static(__dirname + '/static/js'));
} else{ //prod
  app.use('/skrpt', express.static(__dirname + '/dist'));
  app.use('/js', express.static(__dirname + '/static/js-min'));
}
app.use(express.static(__dirname + '/static'));

var session = require('express-session');
var FileStore = require('session-file-store')(session);
app.use(session({
  store: new FileStore({
    path : __dirname + '/sessions',
    ttl : 3600 * 24 * 365 * 1000, // 1000 years.
    retries : 0,
  }),
  secret: config.secret,
  cookie: {maxAge: 3600 * 24 * 365 * 1000 * 1000},
  resave: true,
  saveUninitialized: true,
}));

var Model = require('./model');

var mustacheExpress = require('mustache-express');
app.engine('must', mustacheExpress());
app.set('view engine', 'mustache');
app.set('views', __dirname + '/views');

//middleware?
//fetch user from model, store it in req.user
var userify = function(req,res,next){
  Model.get_user_from_session_id(req.session.id).then( (user) => {
    req.user = user;
    req.session.userid = user.id;
    next();
  });
};
var spec_params = function(req,res,next){
  req.spec = {};
  if(req.query.pieces)
    req.spec.pieces = req.query.pieces;
  if(req.query.perturbation)
    req.spec.perturbation = req.query.perturbation;
  next();
};

// make it rain
app.get('/',userify,spec_params, function(req, res) {
  console.log(req.user.id + ' doing /');
  req.spec.mode= "rain";
  res.render('puzzle.must', {title:'The Dark Souls of casual jigsaw games', spec: JSON.stringify(req.spec), env: config.env});
});

app.get('/random',userify,spec_params, function(req, res) {
  console.log(req.user.id + ' doing /random');
  req.spec.img_from= "random";
  res.render('puzzle.must',
    {
      title:'The Dark Souls of Dwarf Fortresses',
      spec: JSON.stringify(req.spec),
      env: config.env});
});

app.get('/t3/:t3id',userify,spec_params, function(req, res) {
  Model.t3_from_db(req.params.t3id).then(t3 => {
    req.spec.img_from = 'reddit';
    req.spec.t3 = t3;
    //for (var attrname in req.spec) { spec[attrname] = req.spec[attrname]; }
    res.render('puzzle.must', {title:'Jigsaw', spec: JSON.stringify(req.spec), env: config.env});
  }).catch( err => {
    console.log(err);
    res.json(err);
  });
});

app.get('/t3data/:t3id', userify, (req,res) => {
  Model.t3_from_db(req.params.t3id).then(t3 => {
    //this somehow makes it pretty in the browser.
    res.set({'Content-Type': 'application/json; charset=utf-8'}).status(200).send(JSON.stringify(t3, undefined, ' '));
  })
  .catch( err => {res.json(err)});
});

app.get('/blank/:color?', userify, spec_params,(req,res) => {
  console.log(req.user.id + ' doing /blank');
  req.spec.img_from = 'solidcolor';
  //req.spec.color = 'random';
  if (req.params.color)
    req.spec.color = req.params.color;
  req.spec.width = 100;
  req.spec.height= 100;
  res.render('puzzle.must', {title:'The Superman 64 of Dwarf Fortresses', spec: JSON.stringify(req.spec), env: config.env});
});
app.get('/scream', userify, spec_params, (req,res) => {
  console.log(req.user.id + ' doing /scream');
  req.spec.img_from = "scream";
  res.render('puzzle.must', {title:'😱 😱 😱 😱 😱', spec: JSON.stringify(req.spec), env: config.env});
});

app.get('/overworld', userify, spec_params, (req,res) => {
  console.log(req.user.id + ' doing /overworld');
  req.spec.mode= "overworld";
  res.render('puzzle.must', {title:'The Dwarf Fortress of casual jigsaw games', spec: JSON.stringify(req.spec), env: config.env});
});

app.get('/scrapereddit', function(req,res){
  Model.pools.default.scrape().then(function(thing){
    res.json(thing);
  });
});

app.get('/t3_img/:t3id', (req,res) => {
  //Model.stream_t3pic(req.params.t3id)
  Model.fspath_t3pic(req.params.t3id)
    .then( fspath => {
      res.setHeader("content-type", "image/jpeg");
      res.sendFile(fspath);
      //stream.pipe(res);
    }).catch(err => {
      console.log('img for '+req.params.t3id+' not found');
      if (/host-removed/.exec(err))
        Model.purge_t3(req.params.t3id);
      res.status(404).json(err + '.nyxnyxnyx')
    });
});
app.get('/thumb/:t3id', userify, (req,res) => {
  //res.setHeader("content-type", "image/jpeg");
  //res.sendFile(path.join(__dirname, 'static', 'images', 'scream.jpg'));
  let dims = [1.61,1];
  if (req.query.width && req.query.height)
    dims = [req.query.width, req.query.height];
  req.user.rand_unfinished_t3(dims).then( (tng) => {
    Model.fspath_t3thumb(tng.data.id).then( (fspath) => {
      res.setHeader("content-type", "image/jpeg");
      res.sendFile(fspath);
    }).catch( err => {
      console.log('thumbnail for '+req.params.t3id+' not found');
      res.status(404).json(err + '../thumb/fail')
    });
  }).catch( err => {
    console.log(err + '.nothumb');
    res.json( {err: 'thumb error: |'+ err + '|, so no thumb...'})
  });
});

app.get('/rand_puz_t3/', userify, function(req,res){
  let dims = [1.61,1];
  if (req.query.width && req.query.height)
    dims = [req.query.width, req.query.height];
  var p = new Promise( (resolve,reject) => {
    req.user.rand_unfinished_t3(dims).then( (tng) => {
      resolve(tng);
    }).catch( err=>{ reject(err + '.p3p3') });;
  }).then( (tng) => {
    console.log(req.user.id + ' rolled '+ tng.data.id);
    res.json(tng)
  }).catch( err => {res.status(404).json(err + '.dadadadada')});
});


app.get('/fin/:t3id', userify, (req,res) => {
  req.user.fin_t3(req.params.t3id).then( fins => {
    console.log ( 'user '+req.user.id+ ' fin\'d puzzle '+req.params.t3id);
    res.json({ //success
      fins: fins,
      ok : 'ok'});
  }, reason => { //fail
    res.json({
      ok: 'not really',
      reason: reason
    });
  });
});

/**
 *  * https://gist.github.com/hurjas/2660489
 *  * Return a timestamp with the format "m/d/yy h:MM:ss TT"
 *   * @type {Date}
 *    */

function timeStamp() {
  // Create a date object with the current time
  var now = new Date();

  //   // Create an array with the current month, day and time
  var date = [ now.getMonth() + 1, now.getDate(), now.getFullYear() ];

  // Create an array with the current hour, minute and second
  var time = [ now.getHours(), now.getMinutes(), now.getSeconds() ];

  // Determine AM or PM suffix based on the hour
  var suffix = ( time[0] < 12 ) ? "AM" : "PM";

  // Convert hour from military time
  time[0] = ( time[0] < 12 ) ? time[0] : time[0] - 12;

  // If hour is 0, set it to 12
  time[0] = time[0] || 12;

  // If seconds and minutes are less than 10, add a zero
  for ( var i = 1; i < 3; i++ ) {
    if ( time[i] < 10 ) {
      time[i] = "0" + time[i];
    }
  }

  // Return the formatted string
  return date.join("/") + " " + time.join(":") + " " + suffix;
}
setInterval( ()=>{ // log time every 10 mins.
  console.log(timeStamp());;
}, 10*60*1000);

console.log('http://localhost:8888');
app.listen(8888);

