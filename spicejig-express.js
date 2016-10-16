//var http = require("http");
var express = require('express');
var request = require('request');
//var cheerio = require('cheerio');
var app = express();
app.use(express.static('static'));

app.get('/',function(req, res) {
  console.log(req.query.blargles);
  var ttt = false;
  if (req.query.username === undefined) ttt = true;
  res.json({query: ttt});
});

function rand_reddit_thing(){ //return a promise
  var url = "https://www.reddit.com/r/ImaginaryMindscapes/.json";
  var p = new Promise(function(resolve,reject){
    request(url, function(err,scrape_res, res_json){
      if(err) { res.json("blehblah "+ err.code); return;}
      if (scrape_res.statusCode !== 200) { res.json("code "+ scrape_res.statusCode); return;}
      var res_parsed = JSON.parse(res_json);
      if(res_parsed.kind !== "Listing") { res.json(res_parsed.kind); return;}
      var things = res_parsed.data.children;
      jpg_regex = /\.jpe?g(\?.*)?$/;
      nothings = things.filter(function(t){return ! t.data.url.match(jpg_regex)});
      things = things.filter(function(t){return t.data.url.match(jpg_regex)});
      var thing = things[Math.floor(Math.random()*things.length)];
      resolve(thing);
    });
  });
  return p;
}
app.get('/scrapejson', function(req,res){
  rand_reddit_thing().then(function(thing){
    res.json(thing);
  });
});

app.get('/t3/:t3id', (req,res) => {
  res.sendFile('/home/zach/codestuff/scratch/spicejig/' + 'static/images/scream.jpg');
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
app.get('/new_puz_spec', function(req,res){
  var thing = rand_reddit_thing().then( (tng) => {
    res.json(tng);
  });
  //res.json({img_url : thing.img_url});
});

app.listen(8888);

