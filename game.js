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
    game.load.image("scream", "scream.jpg");
	},
	create: function(){
    puzzle = new Puzzle(game, "scream", 6, 6);
  }
}

