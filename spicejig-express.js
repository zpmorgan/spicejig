//var request = require('request');
var express = require('express');
var app = express();
app.use(express.static(__dirname + '/static'));

var session = require('express-session');
var FileStore = require('session-file-store')(session);
app.use(session({
  store: new FileStore,
  secret: 'lkasjdhfgkjlhafdgiludfha98fha98hf9agh',
  resave: true,
  saveUninitialized: true,
  path : __dirname + '/sessions'
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
    console.log("user " + user.id + ' connected.  sessid: '+ req.session.id);
    next();
  });
};

app.get('/',function(req, res) {
  //res.sendFile(__dirname + '/static/puzzle.html');
  var spec = {source : "random"};
  if(req.query.pieces)
    spec.pieces = req.query.pieces;
  res.render('puzzle.must', {title:'Jigsaw', spec: JSON.stringify(spec)});
});

//geometryitudeificatoralizor
//squarifaciareifier
//squaritudeifier
//squaritizationalizor
//geomitificilator
//squeerifier.squeerify
//tileosqueequalizer
//geomosquaralizor.geomosquaralize()
app.get('/blank', (req,res) => {
  console.log(req.session.id);
  req.session.blargles = 'foo';
  var spec = {
    img_from: 'solidcolor',
    w: 100,
    h: 100,
    pieces: 100,
  };
  if(req.query.pieces)
    spec.pieces = req.query.pieces;
  res.render('puzzle.must', {title:'Blank Jigsaw', spec: JSON.stringify(spec)});
});
app.get('/scream', (req,res) => {
  var spec = {img_from: "scream"};
  if(req.query.pieces)
    spec.pieces = req.query.pieces;
  res.render('puzzle.must', {title:'😱 😱 😱 😱 😱', spec: JSON.stringify(spec)});
});

app.get('/scrapereddit', function(req,res){
  Model.scrape_reddit().then(function(thing){
    res.json(thing);
  });
});

app.get('/t3/:t3id', (req,res) => {
  var img_dir = "/tmp/";
  var filename = req.params.t3id + '.jpg';
  //var fspath = img_dir + filename;
  Model.t3_img_path_when_ready(req.params.t3id)
    .then( (filepath) => {
      res.sendFile(filepath);
    })
    .catch( (err) => {
      console.log(err);
      res.json(err);
    });
  return;

  fs.access(fspath, fs.constants.R_OK, (err) => {
    if(!err){
      res.sendFile(fspath);
      return;
    }
    Model.t3_from_db(req.params.t3id).then( (thing)=>{
      //download from imgur, deviantart, etc, then tell express to send the file
      request
        .get(thing.data.url)
        .pipe(fs.createWriteStream(fspath))
        .on('finish', () => {
          res.sendFile(fspath);
        });
    });
  });
  //res.sendFile('/home/zach/codestuff/scratch/spicejig/' + 'static/images/scream.jpg');
});

app.get('/scrape', function(req,res){
  var url = "https://www.reddit.com/r/ImaginaryBestOf";
  request(url, function(err,scrape_res,html){
    if(err) return;
    var $ = cheerio.load(html);
    var entries = $('.thing');
    var entry = entries.get(Math.floor(Math.random()*entries.length));
    console.log(Object.getOwnPropertyNames(entries));
    console.log(entry);
    console.log(entry.attr());
    return;
    var entries = $('.thing').toArray();
    console.log(entries[0]);
    res.json(entries[0].attr('data-url'));
    var entry = entries[Math.floor(Math.random()*entries.length)];
    return;
    console.log(entries);
    console.log(entries.toArray().length);
                return;
    //console.log(entries);
    var entry = entries[Math.floor(Math.random()*entries.length)];
    console.log(entries);
    console.log(entry.data('url'));
    console.log(entries[0].data('url'));
    res.json(entries[0].attr('data-url'));
  });
});
app.get('/new_puz_spec', userify, function(req,res){
  var p = new Promise( (resolve,reject) => {
    req.user.rand_unfinished_t3().then( (tng) => {
      tng.img_from = 'reddit';
      resolve(tng);
    }).catch( err=>{ reject(err + '.p3p3') });;
  });
  p.then( (tng) => {res.json(tng)});
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

app.listen(8888);

