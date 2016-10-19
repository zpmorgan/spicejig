var game;
var puzzle;

requirejs(['domReady', 'phaser', 'puzzle'], function(domReady){
  domReady(function() {
    game = new Phaser.Game(window.innerWidth, window.innerHeight);
    game.state.add("PlayGame", playGame)
    game.state.add("Boot", boot)
    game.state.start("Boot");
  });
});

function loadJSON(path, success, error)
{
  var xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function()
  {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status === 200) {
        if (success)
          success(JSON.parse(xhr.responseText));
      } else {
        //if (error)
        console.error(xhr);
      }
    }
  };
  xhr.open("GET", path, true);
  xhr.send();
}

var boot = function(game){}
boot.prototype = {
  preload: function(){
    game.load.json('spec', '/new_puz_spec');
  },
  create: () => {
    game.state.start('PlayGame');
  }
};

var playGame = function(game){}
playGame.prototype = {
	preload: function(){
    //game.load.image("scream", "images/scream.jpg");
    var spec = game.cache.getJSON('spec');
    game.load.image('scream', '/t3/' + spec.data.id);
    console.log('loading image ' + spec.data.id);
	},
	create: function(){
    game.canvas.oncontextmenu = function (e) { e.preventDefault(); }
    //game.load.image("scream", "images/scream.jpg");
    //game.load.image('scream', '/t3/' + spec.data.id);
    //game.load.image("scream", "images/scream.jpg");
    //game.load.start();
    //game.load.image('scream', spec.data.url);
    puzzle = new Puzzle(game, "scream", 7, 7);
  }
}

