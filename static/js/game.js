var game;
var puzzle;

//maybe the spec is supplied directly
//or maybe we have to source it from /new_puz_spec
//var rand_spec = G.spec.img_from == "random" ? true : false;
var rain_spec = G.spec.img_from == "rain" ? true : false;
//var blank_spec = G.spec.img_from == "solidcolor" ? true : false;

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
    if (G.spec.img_from == "random")
      game.load.json('t3', '/rand_puz_t3');
    game.load.image('playbutton', '/images/play.png');
    game.load.image('pausebutton', '/images/pause.png');
    game.load.audio('victorysound', '/victory.mp3');
  },
  create: () => {
    if (G.spec.img_from == "random")
      G.spec.t3 = game.cache.getJSON('t3');

    game.state.start('PlayGame');
  }
};


var playGame = function(game){}
playGame.prototype = {
	preload: function(){
    GUI.add_audio('/Di0nysys-Way-of-the-Sword');
    //game.load.image("scream", "images/scream.jpg");
    var spec = G.spec;
    if (spec.img_from == "random")
      game.load.image('scream', '/t3_img/' + G.spec.t3.data.id);
    else if (spec.img_from == "scream")
      game.load.image("scream", "images/scream.jpg");
    else if (spec.img_from == "solidcolor"){
    }
    else
      console.error( 'from whence it from?' );
    game.load.image('bg', '/images/bg.jpg');

    game.fin = function(){
      game.sound.play('victorysound');
      if(spec.img_from === 'random')
        loadJSON('fin/' + spec.t3.data.id); // just report the fin
      console.log('fin');
      GUI.add_art_info_button();
    };
	},
	create: function(){
    game.canvas.oncontextmenu = function (e) { e.preventDefault(); }
    game.bg = game.add.tileSprite(0, 0, game.width, game.height, 'bg');

    let spec = G.spec;
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
    GUI.add_sound_button();
  }
}
var rain = function(game){}
rain.prototype = {
  create : function(){
    let spec = G.spec;
    let gauss01 = gaussian(0,1);
    let doit = function(){
      //observer at u=0, v=0;
      //higher v = further away, smaller
      //v=1: size 25, v=0: size inf.
      //v=1: dur 10 secs; v=0: dur 0.
      var u = Math.random() - .5;
      var v = Math.random();
      if (v < .1) { doit(); return;}//try again
      var x = u / v;
      x += .5;
      x *= this.game.width;
      var size = 25;
      size /= v;
      var dur = 10;
      dur *= v;

      var picCB = Puzzle.genPieceCanvasBuffer(size, 'random', spec.perturbation);
      var tex = PIXI.Texture.fromCanvas(picCB.canvas);
      //var piece = this.game.add.sprite(300 - tex.width/2,-100 - tex.height/2,tex);
      var piece = this.game.add.sprite(x, - tex.height/2,tex);
      piece.angle = Math.random() * 360;
      piece.anchor.x = 0.5;
      piece.anchor.y = 0.5;
      var tween = this.game.add.tween(piece).to({
          y:this.game.height+piece.height/2,
          angle:(gauss01()+2)*90*dur},
        dur*1000, null, true);
      tween.onComplete.add( ()=> {
        piece.destroy();
        doit();
      }, this);
    };
    for (let i=0;i<200;i++)
      doit();

    var menu_html  =  "<a class='menu' onclick='GUI.new_puz();'> New Puzzle </a>";
    menu_html += "<br> <a class='menu' onclick='GUI.blank_puz();'> Blank Puzzle </a>";
    menu_html += "<br> <a class='menu' onclick='GUI.disp_halp();'> Help </a>";
    menu_html += "<br> <a class='menu' onclick='GUI.disp_credits();'> Music Credits </a>";
    GUI.impose_center_dom_box(menu_html);
    //GUI.add_audio('/Di0nysys-Way-of-the-Sword');
    GUI.add_audio('/Psychedelic Neon - Rain on Snow (Shame Odyssey Remix)');
  }
}
GUI = {};
GUI.imposition_stack = [];
GUI.top_imposition_elem = function(){
  return GUI.imposition_stack[GUI.imposition_stack.length-1];
};
GUI.clear_imposition_stack = function(){
  while(GUI.imposition_stack.length > 0)
    GUI.pop_center_dom_box();
};

GUI.push_center_dom_box = function(html){
  if(GUI.imposition_stack.length > 0)
    GUI.top_imposition_elem().style.display = "none";
  html = '<a class="boxclose" onClick="GUI.pop_center_dom_box();" id="boxclose"></a>' + html;
  var box = GUI.center_dom_box(html);
  GUI.imposition_stack.push(box);
  return box;
};
GUI.impose_center_dom_box = function(html){
  var box = GUI.center_dom_box(html);
  GUI.imposition_stack = [box];
  return box;
};
GUI.pop_center_dom_box = function(){
  var box = GUI.imposition_stack.pop();
  box.parentNode.removeChild(box);
  if(GUI.imposition_stack.length > 0)
    GUI.top_imposition_elem().style.display = "block";
};


GUI.center_dom_box = function(html){
  var div = document.createElement('div');
  div.className = 'imposition';
  div.style.color = "#ffffff";
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}


GUI.disp_credits = function(){
  var credits_html = "Music: Di0nysys - Way of the Sword </br> "
    + '<a href="https://soundcloud.com/di0/di0nysus-way-of-the-sword">https://soundcloud.com/di0/di0nysus-way-of-the-sword</a> <br>'
    + 'Licensed under CC-BY';
  credits_html += "<br><br> Psychedelic Neon - Rain on Snow (Shame Odyssey Remix) </br> "
    + '<a href="https://soundcloud.com/shameodyssey/psychedelic-neon-rain-on-snow">https://soundcloud.com/shameodyssey/psychedelic-neon-rain-on-snow</a> <br>'
    + 'Licensed under CC-BY';
  GUI.push_center_dom_box(credits_html);
};
GUI.disp_halp = function(){
  var halp_html = "It's a jigsaw puzzle. Put the pieces together."
    GUI.push_center_dom_box(halp_html);
};
GUI.blank_puz = function(){
  GUI.clear_imposition_stack();
  G.spec = {img_from : 'solidcolor', color:'white'};
  game.state.start('Boot');
}
GUI.new_puz = function(){
  GUI.clear_imposition_stack();
  G.spec = {img_from : 'random'};
  game.state.start('Boot');
}

GUI.add_audio = function(filename_base){ // assume ogg & mp3
  if(GUI.audio_elem)
    GUI.audio_elem.parentNode.removeChild(GUI.audio_elem);
  var audio = document.createElement('audio');
  var src_html = '';
  src_html += '<source src="' + filename_base + '.mp3" type="audio/mpeg">';
  src_html += '<source src="' + filename_base + '.ogg" type="audio/ogg">';
  audio.innerHTML = src_html;
  audio.autoplay = true;
  audio.loop = true;
  audio.id = 'musick';
  document.body.appendChild(audio);
  GUI.audio_elem = audio;
};
GUI.playPause = function(){
  //var audio = document.getElementById("musick");
  var audio = GUI.audio_elem;
  if (audio.paused){
    audio.play();
    game.soundBtn.key = "pausebutton";
    game.soundBtn.loadTexture("pausebutton", 0);
  } else {
    audio.pause();
    game.soundBtn.loadTexture("playbutton", 0);
  }
};
GUI.add_sound_button = function(){ // 🔇 🔊
  game.soundBtn = game.add.button(20,20,'pausebutton', GUI.playPause, this,null,null,null);
  game.soundBtn.width = 55;
  game.soundBtn.height= 55;
};

GUI.add_art_info_button = function(){
  var div = document.createElement('div');
  div.className = 'GUI';
  div.innerHTML = "ⓘ";
  div.style.position = 'fixed';
  div.style.left = "50%";
  div.style.transform = "translate(-50%)";
  div.style.top = 0;
  div.style['font-size'] = '88px';
  div.onclick = GUI.disp_art_credits;
  document.body.appendChild(div);
};
GUI.disp_art_credits = function(){
  GUI.clear_imposition_stack();
  var credit_html = "Whoop de doo for you!";
  if(G.spec.img_from == 'random'){
    credit_html = "Art Credit:";
    console.log(G.spec.t3);
    credit_html += '<br> '+ G.spec.t3.data.title;
    credit_html += '<br> <a href="https://reddit.com'+ G.spec.t3.data.permalink + '">Reddit link</a>';
    credit_html += '<br> <a href="'+ G.spec.t3.data.url + '">Original link</a>';
  }
  GUI.push_center_dom_box(credit_html);
};


