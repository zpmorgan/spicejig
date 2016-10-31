var game;
var puzzle;

//maybe the spec is supplied directly
//or maybe we have to source it from /new_puz_spec
var source_spec = G.spec.source == "random" ? true : false;
var rain_spec = G.spec.source == "rain" ? true : false;
var blank_spec = G.spec.img_from == "solidcolor" ? true : false;

requirejs(['domReady', 'phaser', 'puzzle'], function(domReady){
  domReady(function() {
    game = new Phaser.Game(window.innerWidth, window.innerHeight);
    game.state.add("PlayGame", playGame)
    game.state.add("Boot", boot)
    game.state.add("Rain", rain)
    if (rain_spec)
      game.state.start("Rain");
    else 
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
      if (source_spec == false)
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
    if (source_spec)
      game.load.json('spec', '/new_puz_spec');
    game.load.image('playbutton', '/images/play.png');
    game.load.image('pausebutton', '/images/pause.png');
    game.load.audio('victorysound', '/victory.mp3');
  },
  create: () => {
    if(source_spec)
      if(G.spec.pieces)
        game.getSpec().pieces = G.spec.pieces;

    game.state.start('PlayGame');
  }
};


var playGame = function(game){}
playGame.prototype = {
	preload: function(){
    //game.load.image("scream", "images/scream.jpg");
    var spec = game.getSpec();
    if (spec.img_from == "reddit")
      game.load.image('scream', '/t3_img/' + spec.data.id);
    else if (spec.img_from == "scream")
      game.load.image("scream", "images/scream.jpg");
    else if (spec.img_from == "solidcolor"){
    }
    else
      console.error( 'from whence it from?' );
    game.load.image('bg', '/images/bg.jpg');

    game.fin = function(){
      game.sound.play('victorysound');
      if(spec.img_from === 'reddit')
        loadJSON('fin/' + spec.data.id); // just report the fin
      console.log('fin');
    };
	},
	create: function(){
    let spec = game.getSpec();
    let what_to_cut = {key:"scream"};
    if (spec.img_from == "solidcolor"){
      what_to_cut = {color:"white", width:8, height:6}; //it scales anyways
    }

    game.canvas.oncontextmenu = function (e) { e.preventDefault(); }
    game.bg = game.add.tileSprite(0, 0, game.width, game.height, 'bg');
    puzzle = new Puzzle(game, game.fin, what_to_cut, spec.pieces || 80);
    game.soundBtn = this.add.button(20,20,'pausebutton', game.playPause, this,null,null,null);
    game.soundBtn.width = 55;
    game.soundBtn.height= 55;
  }
}
var rain = function(game){}
rain.prototype = {
  create : function(){
    var pictex = Puzzle.genPiecetexture(150, 'white');
    this.game.add.sprite(200,200,pictex);
    console.log(this);
    console.log(game);


  }
}




