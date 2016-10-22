var game;
var puzzle;

//maybe the spec is supplied directly
//or maybe we have to source it from /new_puz_spec
var source_json = G.spec.source ? true : false;

requirejs(['domReady', 'phaser', 'puzzle'], function(domReady){
  domReady(function() {
    game = new Phaser.Game(window.innerWidth, window.innerHeight);
    game.state.add("PlayGame", playGame)
    game.state.add("Boot", boot)
    game.state.start("Boot");
    game.playPause = function(){
      var audio = document.getElementById("musick");
      if (audio.paused){
        audio.play();
        game.soundBtn.key = "pausebutton";
        game.soundBtn.loadTexture("pausebutton", 0);
      } else {
        audio.pause();
        game.soundBtn.loadTexture("playbutton", 0);
      }
    }
    game.getSpec = function(){
      if (source_json == false)
        return G.spec;
      return game.cache.getJSON('spec');
    }
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
    if (source_json)
      game.load.json('spec', '/new_puz_spec');
    game.load.image('playbutton', '/images/play.png');
    game.load.image('pausebutton', '/images/pause.png');
    game.load.audio('victorysound', '/victory.mp3');
  },
  create: () => {
    game.state.start('PlayGame');
  }
};


var playGame = function(game){}
playGame.prototype = {
	preload: function(){
    //game.load.image("scream", "images/scream.jpg");
    var spec = game.getSpec();
    if (spec.img_src == "reddit")
      game.load.image('scream', '/t3/' + spec.data.id);
    else if (spec.img_src == "scream")
      game.load.image("scream", "images/scream.jpg");
    //else if (spec.img_src == "blank")
    game.load.image('bg', '/images/bg.jpg');

    game.fin = function(){
      game.sound.play('victorysound');
      console.log('fin');
    };
	},
	create: function(){
    game.canvas.oncontextmenu = function (e) { e.preventDefault(); }
    puzzle = new Puzzle(game, game.fin, "scream", 80);
    game.soundBtn = this.add.button(20,20,'pausebutton', game.playPause, this,null,null,null);
    game.soundBtn.width = 55;
    game.soundBtn.height= 55;
  }
}

