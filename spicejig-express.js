//var http = require("http");
var express = require('express');
var app = express();

app.use(express.static('static'));

app.get('/',function(req, res) {
  console.log(req.query.blargles);
  var ttt = false;
  if (req.query.username === undefined) ttt = true;
  res.json({query: ttt});
});

app.listen(8888);



