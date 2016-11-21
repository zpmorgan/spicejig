var config;
try {
  config = require('./config.json')
  console.log('loading config.json');
} catch (ex) {
  console.log('config not found.');
  config = {
    secret: 'lkasjdhfgkjlhafdgiludfha98fha98hf9agh',
    env: 'dev',
  }
}

var express = require('express');
var app = express();
app.use(express.static(__dirname + '/static'));
if (config.env === 'dev')
  app.use('/skrpt', express.static(__dirname + '/lib'));
else
  app.use('/skrpt', express.static(__dirname + '/dist'));

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
  req.spec.img_from = "rain";
  res.render('puzzle.must', {title:'The Dark Souls of casual jigsaw games', spec: JSON.stringify(req.spec), env: config.env});
});

app.get('/random',userify,spec_params, function(req, res) {
  console.log(req.user.id + ' doing /random');
  req.spec.img_from= "random";
  res.render('puzzle.must', {title:'Jigsaw', spec: JSON.stringify(req.spec), env: config.env});
});

app.get('/t3/:t3id',userify,spec_params, function(req, res) {
  Model.t3_from_db(req.params.t3id).then(t3 => {
    var spec = {};
    spec.img_from = 'reddit';
    spec.t3 = t3;
    //for (var attrname in req.spec) { spec[attrname] = req.spec[attrname]; }
    res.render('puzzle.must', {title:'Jigsaw', spec: JSON.stringify(spec), env: config.env});
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
  req.session.blargles = 'foo';
  req.spec.img_from = 'solidcolor';
  //req.spec.color = 'random';
  if (req.params.color)
    req.spec.color = req.params.color;
  req.spec.width = 100;
  req.spec.height= 100;
  res.render('puzzle.must', {title:'Blank Jigsaw', spec: JSON.stringify(req.spec), env: config.env});
});
app.get('/scream', userify, spec_params, (req,res) => {
  req.spec.img_from = "scream";
  res.render('puzzle.must', {title:'😱 😱 😱 😱 😱', spec: JSON.stringify(req.spec), env: config.env});
});

app.get('/scrapereddit', function(req,res){
  Model.scrape_reddit().then(function(thing){
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
      res.status(404).json(err + '.nyxnyxnyx')
    });
});

app.get('/rand_puz_t3/', userify, function(req,res){
  dims = [1,1];
  if (req.query.width && req.query.height)
    dims = [req.query.width, req.query.height];
  var p = new Promise( (resolve,reject) => {
    req.user.rand_unfinished_t3(dims).then( (tng) => {
      resolve(tng);
    }).catch( err=>{ reject(err + '.p3p3') });;
  });
  p.then( (tng) => {
    console.log(req.user.id + ' rolled '+ tng.data.id);
    res.json(tng)
  });
  p.catch( err => {res.json(err + '.dadadadada')});
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

app.listen(8888);

