var game;
var puzzle;

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
    game.load.image("scream", "images/scream.jpg");
	},
	create: function(){
    game.canvas.oncontextmenu = function (e) { e.preventDefault(); }
    puzzle = new Puzzle(game, "scream", 3, 3);
  }
}

