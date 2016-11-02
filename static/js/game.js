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
    game.canvas.oncontextmenu = function (e) { e.preventDefault(); }
    game.bg = game.add.tileSprite(0, 0, game.width, game.height, 'bg');

    let spec = game.getSpec();
    let what_to_cut = {key:"scream"};
    if (spec.img_from == "solidcolor"){
      what_to_cut = {width:8, height:6}; //it scales anyways
      if(spec.color)
        what_to_cut.color = spec.color;
    }
    let how_to_cut = {
      pieces : spec.pieces || 80
    };
    if(spec.perturbation)
      how_to_cut.perturbation = spec.perturbation;
    puzzle = new Puzzle(game, game.fin, what_to_cut, how_to_cut);
    game.soundBtn = this.add.button(20,20,'pausebutton', game.playPause, this,null,null,null);
    game.soundBtn.width = 55;
    game.soundBtn.height= 55;
  }
}
var rain = function(game){}
rain.prototype = {
  create : function(){
    let spec = game.getSpec();
    var doit = function(){
      //observer at u=0, v=0;
      //higher v = further away, smaller
      //v=1: size 25, v=0: size inf.
      //v=1: speed 25; v=0: speed inf.
      var u = Math.random() - .5;
      var v = Math.random();
      if (v < .1) { doit(); return;}//try again
      var x = u / v;
      x += .5;
      x *= this.game.width;
      var size = 25;
      size /= v;
      var speed = 25;
      speed /= v;

      var picCB = Puzzle.genPieceCanvasBuffer(size, 'random', spec.perturbation);
      var tex = PIXI.Texture.fromCanvas(picCB.canvas);
      //var piece = this.game.add.sprite(300 - tex.width/2,-100 - tex.height/2,tex);
      var piece = this.game.add.sprite(x,-100 - tex.height/2,tex);
      piece.anchor.x = 0.5;
      piece.anchor.y = 0.5;
      var tween = this.game.add.tween(piece).to({y:4*speed, angle:555}, 4000, null, true);
      console.log(tex);
      console.log(game);
      tween.onComplete.add( ()=> {
        piece.destroy();
        doit();
      }, this);
    };
    for (let i=0;i<50;i++)
      doit();
  }
}




