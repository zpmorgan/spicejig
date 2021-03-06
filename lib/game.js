var game;
var puzzle;
var savecpu;

var Storage = window.localStorage;

//maybe the spec is supplied directly
//or maybe we have to source it from /new_puz_spec

function load_plugins(){
  savecpu = new Phaser.Plugin.SaveCPU();
  game.plugins.add(savecpu);
  savecpu.renderOnFPS = 0;
  savecpu.renderOnPointerChange = true;
  console.log('savecpu added?');
}
function figure_out_state(){
  game.state.add("PlayGame", playGame)
  game.state.add("Boot", boot)
  game.state.add("Rain", rain)
  game.state.add("Overworld", overworld)
  if (G.spec.mode == "overworld")
    game.state.start("Overworld");
  else if (G.spec.mode == "rain")
    game.state.start("Rain");
  else
    game.state.start("Boot");
}

function STARTWHENREADY(domReady){
  domReady(function() {
    game = new Phaser.Game(window.innerWidth, window.innerHeight, Phaser.AUTO, '',
      { //default state, the state that will only run once.
        init:load_plugins,
        create: figure_out_state
      }
    );
  });
};

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
    GUI.clear_gui();
    console.log('doing boot');
    console.log(G.spec);
    let pool = G.spec.pool || "default";
    if (G.spec.img_from == "random")
      game.load.json('t3', '/rand_puz_t3?width='+game.width+ '&height=' + game.height + '&pool='+pool, 1);
    game.load.image('playbutton', '/images/play.png');
    game.load.image('pausebutton', '/images/pause.png');
    game.load.audio('victorysound', '/victory.mp3');
    game.load.audio('golf-swing', '/sport_golf_swing_club_hit_ball_002.mp3');
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
    GUI.clear_gui();
    console.log('doing playgame');
    GUI.add_audio('/Di0nysys-Way-of-the-Sword');
    var spec = G.spec;
    if (spec.img_from === "random" || spec.img_from === 'reddit'){
      let pool = G.spec.pool || 'default';
      game.load.image('scream', '/t3_img/' + G.spec.t3.data.id + '?pool=' + pool, true);
    }
    else if (spec.img_from == "scream")
      game.load.image("scream", "images/scream.jpg", true);
    else if (spec.img_from == "solidcolor"){
    }
    else
      console.error( 'from whence it from?' );
    game.load.image('bg', '/images/bg.jpg');
    game.load.onFileError.addOnce((key,file) => {
      let notfound_html = "img removed? http://redd.it/" + G.spec.t3.data.id;
      notfound_html += "<br> <a class='menu-option' onclick='GUI.go_back_to_overworld();'> Back </a>";
      GUI.impose_center_dom_box(notfound_html);
      console.log('image not found!', key, file);
      //G.spec = {img_from: 'random'};
      delete G.spec.t3;
      G.spec.img_from = 'random';
      game.state.start('Boot');
    });
    game.scale.scaleMode = Phaser.ScaleManager.RESIZE;
    game.scale.fullScreenScaleMode = Phaser.ScaleManager.RESIZE;
  },
  create: function(){
    game.stage.setBackgroundColor(0x224422);
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
    puzzle = new Puzzle(game, what_to_cut, how_to_cut);
    game.scale.onSizeChange.add( ()=>{
      //game.scale.refresh();
      game.bg.width = window.screen.width;
      game.bg.height= window.screen.height;
      puzzle.game_resized();
    }, this);
    puzzle.fin_cb = function(){
      GUI.add_audio('/in-search-of-asia');
      //game.sound.play('victorysound');
      if(spec.img_from === 'random')
        loadJSON('fin/' + spec.t3.data.id); // just report the fin
      console.log('fin');
      GUI.add_art_info_button();
    };
    puzzle.glom_cb = function(){
      game.sound.play('golf-swing', GUI.sfx_vol/100);
    }
    puzzle.drag_start_cb = function(){
      for (let elem of document.querySelectorAll('.imposition')){
        elem.classList.add('drag-over');
      };
    }
    puzzle.drag_stop_cb = function(){
      for (let elem of document.querySelectorAll('.drag-over')){
        elem.classList.remove('drag-over')
      };
    }
    GUI.add_sound_button();
    // translate right clicks to down or up
    document.body.addEventListener('mousedown', e=>{
      if (e.button===2){
        e.stopPropagation();
        if(!GUI.rdrag){
          GUI.rdrag = true;
          GUI.rdragtime = Date.now();
          //game.input.mousePointer.rightButton.start(e); //isDown = true;
          //game.input.mousePointer.updateButtons(e);
          game.input.mousePointer.start(e);
        }
      }
    },{capture:true});
    document.body.addEventListener('mouseup', e=>{
      if (e.button===2){
        e.stopPropagation();
        if (game.input.mousePointer.targetObject === null || game.input.mousePointer.targetObject.isDragged === false){
          //not dragging anything, so send the event anyways
          GUI.rdrag = false;
          game.input.mousePointer.stop(e);
          return;
        }
        if (GUI.rdrag){
          if(Date.now() - GUI.rdragtime > 250){
            GUI.rdrag = false;
            //game.input.mousePointer.rightButton.stop(e); //isDown = true;
            game.input.mousePointer.stop(e);
          }
        }
      }
    },{capture:true});
    var keyf = game.input.keyboard.addKey(Phaser.Keyboard.F);
    keyf.onDown.add(GUI.toggle_fullscren_doc_elem, this);
    savecpu.forceRender();
  }
}
var nframe=0;
var decaframetime = Date.now();
var fps = 0;
var rain = function(game){}
rain.prototype = {
  preload: function(){
    GUI.clear_gui();
    game.scale.scaleMode = Phaser.ScaleManager.RESIZE;
    game.scale.fullScreenScaleMode = Phaser.ScaleManager.RESIZE;
    //window.addEventListener('resize', function () { game.scale.refresh();});
  },
  update: function(){
    savecpu.forceRender();
    if (G.env === 'dev'){
      nframe++;
      if(nframe%10 == 0){
        var ms_per_frame = (Date.now() - decaframetime) / 10;
        decaframetime = Date.now();
        fps = 1000 / (ms_per_frame);
        fps = Math.round(fps);
      }
      //game.debug.text(Math.round(fps), 2, 14, "#00ff00"); // in update
      GUI.show_fps(fps);
    }
  },
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
      x *= game.width;
      var size = 25;
      size /= v;
      var dur = 10;
      dur *= v;

      var picCB = Puzzle.genPieceCanvasBuffer(size, 'random', spec.perturbation);
      var tex = PIXI.Texture.fromCanvas(picCB.canvas);
      //var piece = game.add.sprite(300 - tex.width/2,-100 - tex.height/2,tex);
      var piece = game.add.sprite(x, - tex.height/2,tex);
      piece.angle = Math.random() * 360;
      piece.anchor.x = 0.5;
      piece.anchor.y = 0.5;
      var tween = game.add.tween(piece).to({
          y:game.height+piece.height/2,
          angle:(gauss01()+2)*90*dur},
        dur*1000, null, true);
      tween.onComplete.add( ()=> {
        piece.destroy();
        doit();
      }, this);
    };
    for (let i=0;i<200;i++)
      doit();

    var menu_html  =  "<a class='menu-option' onclick='GUI.new_puz();'> New Puzzle </a>";
    menu_html += "<br> <a class='menu-option' onclick='GUI.new_puz_fullscreen();'> Full-screen Puzzle </a>";
    menu_html += "<br> <a class='menu-option' onclick='GUI.blank_puz();'> Blank Puzzle </a>";
    menu_html += "<br> <a class='menu-option' onclick='GUI.disp_halp();'> Help </a>";
    menu_html += "<br> <a class='menu-option' onclick='GUI.disp_credits();'> Music Credits </a>";
    GUI.impose_center_dom_box(menu_html);
    //GUI.add_audio('/Di0nysys-Way-of-the-Sword');
    GUI.add_audio('/Psychedelic Neon - Rain on Snow (Shame Odyssey Remix)');
  }
}

var overworld = function(game){}
overworld.prototype = {
  preload: function(){
    GUI.clear_gui();
    game.scale.scaleMode = Phaser.ScaleManager.RESIZE;
    game.scale.fullScreenScaleMode = Phaser.ScaleManager.RESIZE;
    //game.load.json('t3', '/rand_puz_t3?width='+game.width+ '&height=' + game.height);
    game.load.image('playbutton', '/images/play.png');
    //game.load.image('thumb'+i.toString(), '/thumb/'+i.toString());
    game.load.image('ground_1x1', '/images/ground_1x1.png'); // from phaser tutorials
    game.load.json('overworld_map', '/overworld.json');
  },
  update: function(){
    if (this.kd.down.isDown){
      game.camera.y += 1;
      savecpu.forceRender();
    }
    if (this.kd.up.isDown){
      game.camera.y -= 1;
      savecpu.forceRender();
    }
    if (this.kd.left.isDown){
      game.camera.x -= 1;
      savecpu.forceRender();
    }
    if (this.kd.right.isDown){
      game.camera.x += 1;
      savecpu.forceRender();
    }
  },
  create : function(){
    this.kd = {
      up: game.input.keyboard.addKey(Phaser.Keyboard.UP),
      down: game.input.keyboard.addKey(Phaser.Keyboard.DOWN),
      left: game.input.keyboard.addKey(Phaser.Keyboard.LEFT),
      right: game.input.keyboard.addKey(Phaser.Keyboard.RIGHT),
    };
    G.overworld_map = game.cache.getJSON('overworld_map');
    // add a blank tilemap
    let map = game.add.tilemap(); //(null, 64,64,100,100);
    map.addTilesetImage('ground_1x1');
    let layer1 = map.create('tiles', 100,100, 32,32);
    game.world.setBounds(0, 0, 3200, 3200);
    //layer1.fixedToCamera = false;
    game.camera.setPosition(32*24.5,32*25);
    let tileWidth = 32;
    let tileHeight = 32;
    let tiledata = G.overworld_map.layers[0].data;
    let fin_tiles = [[50,50],[51,50],[51,51],]// [4,4], [2,2],[2,4],[9,9]];
    for (let i=0;i<10000;i++){
      //map.putTile(tiledata[i]-1, i%100, Math.floor(i/100), 0);
    }
    tiledata[5050] = 13;
    for (let ft of fin_tiles){
      let i = ft[0] + ft[1]*100;
      map.putTile(tiledata[i], ft[0], ft[1], 0);
    }
    let center_tile = map.getTile(50,50);
    let foo= map.getTile(9,9);
    game.camera.focusOnXY(center_tile.worldX, center_tile.worldY);
    let neighbors = (xy) => {
      return [
        [xy[0],xy[1]-1],
        [xy[0],xy[1]+1],
        [xy[0]-1,xy[1]],
        [xy[0]+1,xy[1]],
      ]};
    for (let ft of fin_tiles){
      for (let nbr of neighbors(ft)){
        if (map.getTile(nbr[0],nbr[1]))
          continue;
        let i = nbr[0] + nbr[1]*100;
        let t = map.putTile(tiledata[i]-1, nbr[0], nbr[1], 0);
        t.alpha = .4;
      }
    }

    // http://www.html5gamedevs.com/topic/4263-detecting-click-on-a-tile/
    let clickCallback = function(pointer, event){
      //Tiles world coordinates:
      var tileworldX = pointer.worldX - (pointer.worldX%tileWidth);
      var tileworldY = pointer.worldY - (pointer.worldY%tileHeight);
      //click at 100, 200 world give you 64, 192
      //Tiles coordinates in the grid coords (eg 4 tiles across, 7 down):
      var tileX = Math.floor(pointer.worldX / tileWidth);
      var tileY = Math.floor(pointer.worldY / tileHeight);
      //click at 100, 200 world give you 1, 3
      console.log(tileX, tileY);
      let tile = map.getTile(tileX, tileY);
      if (!tile)
        return;
      G.spec = {img_from: 'random', pieces:100};
      if (tile.index == 24){ //trees
        G.spec.pool = 'faketrees';
      }
      if (tile.index == 25){ //puddle thing
        G.spec.pool = 'fakewater';
      }
      if (tile.index == 13){ //puddle thing
        console.log('POERTAL');
        G.spec.pool = 'fakeportals';
      }
      console.log(tile.index);
      game.state.start('Boot');
    };
    game.input.onDown.add(clickCallback, this);

    savecpu.forceRender();
  }
}

var GUI = {};
GUI.imposition_stack = [];

// show fps in the corner.
GUI.show_fps = fps =>{
  if (!GUI.fps_box){
    var div = document.createElement('div');
    div.className = 'imposition corner';
    document.body.appendChild(div);
    GUI.fps_box = div;
  }
  GUI.fps_box.innerHTML = fps;
};
GUI.top_imposition_elem = function(){
  return GUI.imposition_stack[GUI.imposition_stack.length-1];
};

GUI.clear_imposition_stack = function(){
  while(GUI.imposition_stack.length > 0)
    GUI.pop_center_dom_box();
};
GUI.clear_gui = function(){
  GUI.clear_imposition_stack();
  if(GUI.volume_button){
    GUI.volume_button.parentNode.removeChild(GUI.volume_button);
    delete GUI.volume_button;
  }
  if(GUI.fps_box){
    GUI.fps_box.parentNode.removeChild(GUI.fps_box);
    delete GUI.fps_box;
  }
  if(GUI.art_info_button){
    GUI.art_info_button.parentNode.removeChild(GUI.art_info_button);
    delete GUI.art_info_button;
  }
}

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
  div.className = 'imposition center';
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}


GUI.disp_credits = function(){
  var credits_html = "Music: Di0nysys - Way of the Sword </br> "
    + '<a target="_blank" href="https://soundcloud.com/di0/di0nysus-way-of-the-sword">https://soundcloud.com/di0/di0nysus-way-of-the-sword</a> <br>'
    + 'Licensed under CC-BY';
  credits_html += "<br><br> Psychedelic Neon - Rain on Snow (Shame Odyssey Remix) </br> "
    + '<a target="_blank" href="https://soundcloud.com/shameodyssey/psychedelic-neon-rain-on-snow">https://soundcloud.com/shameodyssey/psychedelic-neon-rain-on-snow</a> <br>'
    + 'Licensed under CC-BY';
  credits_html += "<br><br> In Search Of Asia </br> "
    + 'provided by <a target="_blank" href="http://www.zapsplat.com/music/in-search-of-asia-asian-influenced-percussion-driven-track-with-japanese-koto-melody-haunting-choir-and-strings/">ZapSplat</a>';
  GUI.push_center_dom_box(credits_html);
};
GUI.disp_halp = function(){
  var halp_html = "It's a jigsaw puzzle. Put the pieces together."
  halp_html += "<br> Contact me at zpmor" + "gan@gmail.com"
  GUI.push_center_dom_box(halp_html);
};
GUI.blank_puz = function(){
  GUI.clear_gui();
  G.spec = {img_from : 'solidcolor', color:'white'};
  game.state.start('Boot');
}
GUI.launchIntoFullscreen = function(element) {
  if(element.requestFullscreen) {
    element.requestFullscreen();
  } else if(element.mozRequestFullScreen) {
    element.mozRequestFullScreen();
  } else if(element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  } else if(element.msRequestFullscreen) {
    element.msRequestFullscreen();
  }
}
GUI.full_screen_element = function(){
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement;
}
GUI.exit_full_screen = function(){
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}
GUI.toggle_fullscren_doc_elem = function(){
  if (GUI.full_screen_element())
    GUI.exit_full_screen();
  else
    GUI.fullscren_doc_elem();
}
GUI.fullscren_doc_elem = function(){
  GUI.launchIntoFullscreen(document.documentElement);
}
GUI.new_puz_fullscreen = function(){
  GUI.fullscren_doc_elem();
  GUI.new_puz(); //TODO: resize
}
GUI.new_puz = function(){
  GUI.clear_gui();
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

  //try to figure out the volume
  var vol = Storage.getItem('music_vol');
  if (vol==null)
    vol=100;
  if (vol != 0)
    audio.autoplay = true;
  audio.volume = vol * .15 * .01;

  audio.loop = true;
  audio.id = 'musick';
  document.body.appendChild(audio);
  GUI.audio_elem = audio;
};

GUI.render_sound_button = function(){
  GUI.volume_button.innerHTML = '𝄞' + GUI.music_vol + ' 🔊'+GUI.sfx_vol;
}
GUI.randomize_volumes = function(){
  GUI.music_vol = Math.floor(Math.random() * 125 - 25);
  if (GUI.music_vol < 0){
    GUI.music_vol = 0;
    GUI.audio_elem.pause();
  } else {
    GUI.audio_elem.play();
    GUI.audio_elem.volume = 0.15 * GUI.music_vol / 100;
  }
  GUI.sfx_vol = Math.floor(Math.random() * 125 - 25);
  if (GUI.sfx_vol < 0) GUI.sfx_vol= 0;
  GUI.render_sound_button();
  Storage.setItem('sfx_vol', GUI.sfx_vol);
  Storage.setItem('music_vol', GUI.music_vol);
};
GUI.add_sound_button = function(){ // 🔇 🔊
  GUI.volume_button = document.createElement('div');
  GUI.volume_button.className = 'GUI imposition';
  GUI.volume_button.onclick = GUI.randomize_volumes;
  GUI.volume_button.style.position = 'fixed';
  GUI.volume_button.style.left = "2%";
  GUI.volume_button.style.top= "1%";
  GUI.volume_button.style['font-size'] = "21px";
  GUI.music_vol = Storage.getItem('music_vol');
  GUI.sfx_vol = Storage.getItem('sfx_vol');
  if(GUI.music_vol == null)
    GUI.music_vol = 99;
  if(GUI.sfx_vol == null)
    GUI.sfx_vol = 99;
  document.body.appendChild(GUI.volume_button);
  GUI.render_sound_button();
};

GUI.add_art_info_button = function(){
  var div = document.createElement('div');
  div.className = 'GUI imposition';
  div.innerHTML = "ⓘ";
  div.style.position = 'fixed';
  div.style.left = "50%";
  div.style.transform = "translate(-50%)";
  div.style.top = 0;
  div.style['font-size'] = '88px';
  div.onclick = GUI.disp_art_credits;
  document.body.appendChild(div);
  GUI.art_info_button = div;
};

GUI.go_back_to_overworld = function(){
  console.log(game.state.current);
  game.state.start("Overworld");
}

GUI.disp_art_credits = function(){
  GUI.clear_imposition_stack();
  var credit_html = "Whoop de doo for you!";
  if(G.spec.t3){
    credit_html = "Art Credit:";
    //console.log(G.spec.t3);
    credit_html += '<br> '+ G.spec.t3.data.title;
    credit_html += '<br> <a target="_blank"  href="https://reddit.com'+ G.spec.t3.data.permalink + '">Reddit link</a>';
    credit_html += '<br> <a target="_blank" href="'+ G.spec.t3.data.url + '">Original link</a>';
    credit_html += '<br>'
    credit_html +=  "<a class='menu-option' onclick='GUI.go_back_to_overworld();'> Back </a>";
  }
  GUI.push_center_dom_box(credit_html);
};


