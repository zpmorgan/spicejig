var game;
var puzzle;
var pointsArray = [];
var pointColors = ["0x00ff00", "0x008800", "0x880000", "0xff0000"];
var bezierGraphics;
var movingSprite;


requirejs(['domReady', 'phaser', 'puzzle'], function(domReady){
  domReady(function() {
    game = new Phaser.Game(800, 500);
    game.state.add("PlayGame", playGame)
    game.state.start("PlayGame");
  });
});

var playGame = function(game){}
playGame.prototype = {
	preload: function(){
    game.load.image("point", "point.png");
    game.load.image("scream", "scream.jpg");
	},
	create: function(){
    puzzle = new Puzzle(game, "scream", 4, 4);
  }
}


function bezierPoint(p0, p1, p2, p3, t){
     var cX = 3 * (p1.x - p0.x);
     var bX = 3 * (p2.x - p1.x) - cX;
     var aX = p3.x - p0.x - cX - bX;
     var cY = 3 * (p1.y - p0.y);
     var bY = 3 * (p2.y - p1.y) - cY;
     var aY = p3.y - p0.y - cY - bY;
     var x = (aX * Math.pow(t, 3)) + (bX * Math.pow(t, 2)) + (cX * t) + p0.x;
     var y = (aY * Math.pow(t, 3)) + (bY * Math.pow(t, 2)) + (cY * t) + p0.y;
     return {x: x, y: y};
}
