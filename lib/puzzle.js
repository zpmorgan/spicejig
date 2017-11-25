

// howtocut is either a num_pieces target or a [width,height]
// whattocut is {key:'scream'} or {color:blue, width:333,height:666}
var Puzzle = function(gaem, what_to_cut, how_to_cut){
  "use strict";
  this.game = gaem;
  this.fin_cb= function(){};
  this.glom_cb = function(){};
  this.drag_start_cb = function(){};
  this.drag_stop_cb = function(){};

  if (what_to_cut.key){
    this.img = this.game.cache.getImage(what_to_cut.key);
    this.pattern_type = "img";
    this.iw = this.img.width; //300; //image size. as in, of all the pieces put together.
    this.ih = this.img.height;

    // I need an intermediate canvas
    // else I'm limited at ~200 pieces for some reason.
    // the img->canvas conversion must be especially taxing for some reason on chromium.
    this.source_canvas = document.createElement('canvas');
    this.source_canvas.width = this.iw;
    this.source_canvas.height = this.ih;
    let ctx = this.source_canvas.getContext('2d');
    let pattern = ctx.createPattern(this.img, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, this.iw, this.ih);
  } else {
    this.pattern_type = 'color';
    this.pattern_color = what_to_cut.color || 'white';
    this.iw = what_to_cut.width || 600;
    this.ih = what_to_cut.height || 400;
  };

  if (how_to_cut.dims){
    this.pw = how_to_cut.dims[0];
    this.ph = how_to_cut.dims[1];
  }
  else { //howtocut is 80 or something, so try to cut around that many pieces
    let target_num_pieces = how_to_cut.pieces || 7;
    let aspect_ratio = this.iw / this.ih;
    let pw = Math.round(Math.sqrt(target_num_pieces) * Math.sqrt(aspect_ratio));
    let ph = Math.round(Math.sqrt(target_num_pieces) / Math.sqrt(aspect_ratio));
    console.log(pw + 'x' + ph + '=' + pw*ph);

    this.ph = ph; // pieces wide/high, e.g. 15, 12
    this.pw = pw;
  }

  // scale to the game window
  if(this.game){
    var orig_area = this.iw * this.ih;
    this.working_area = gaem.width * gaem.height;
    this.pre_resize_dims = [gaem.width,gaem.height];
    this.target_area = this.working_area * 0.8;
    // w*h * scale**2 = tw*th
    // scale**2 = tw*th/(w*h)
    // scale = sqrt(target_area / image_area)
    this.img_scale = Math.sqrt(this.target_area / orig_area);
    this.target_iw = this.iw * this.img_scale;
    this.target_ih = this.ih * this.img_scale;
    this.apw = this.target_iw / this.pw; // average piece width. not counting protrusions into neighboring pieces.
    this.aph = this.target_ih / this.ph;
  } else {
    this.apw = this.iw / this.pw;
    this.aph = this.ih / this.ph;
  }

  var puz = this;
  if(this.game) //no need to render sprites
    this.group = this.game.add.group(); //all the pieces are in a group behind some gui stuff.
  this.n_globs = 0;

  // nested class
  // superclass of singlepiece & globule
  this.Piece = function(){
    this.getBounds = function(){
      var borders = this.getBorders();
      var first_point = borders[0].getPaths()[0][0];// bz[0][0][0];
      var x1 = first_point.x;
      var x2 = first_point.x;
      var y1 = first_point.y;
      var y2 = first_point.y;
      borders.forEach(function(bd){
        bd.getPaths().forEach(function(bz){
          for (var i = 0;i<4;i++){
            if(bz[i].x < x1) x1 = bz[i].x;
            if(bz[i].y < y1) y1 = bz[i].y;
            if(bz[i].x > x2) x2 = bz[i].x;
            if(bz[i].y > y2) y2 = bz[i].y;
          }
        });
      });
      //inflate so edge strokes are not cut off.
      return new Phaser.Rectangle(x1,y1, x2-x1, y2-y1).inflate(2,2);
    };
  };
  // px, py are col, row of the jigsaw cut.
  // cx,cy are positions on the canvas.
  this.SinglePiece = function(px,py,borders){
    this.px = px;
    this.py = py;
    this.borders = borders;
    this.getBorders = function(){
      return this.borders;
    };
  };
  this.SinglePiece.prototype = new this.Piece();

  this.squiggle = function(){
    let p = how_to_cut.perturbation || 0.115;
    var midpoint = new Phaser.Point(0.5, 0).perturb(p,0);
    var nubpoint = new Phaser.Point(midpoint.x, 0.3).perturb(0, p);
    var nubpoint_slope = new Phaser.Point(0.29,0).perturb(p, p/2);
    var stalk_offset = new Phaser.Point(-0.05, nubpoint.y * 0.15 );
    var stalk_a = Phaser.Point.add(midpoint, stalk_offset);
    stalk_offset.multiply(-1,1); //other side
    var stalk_b = Phaser.Point.add(midpoint, stalk_offset);
    //var stalk_a = new Phaser.Point(nubpoint.x-0.05, nubpoint.y/2.5);
    var stalk_a_slope = new Phaser.Point(-0.00, nubpoint.y/3);
    var stalk_b_slope = stalk_a_slope.clone().multiply(1,-1);
    var bpaths = [
      [new Phaser.Point(0,0), new Phaser.Point(0.2,0).perturb(p,p/2),
        Phaser.Point.subtract(stalk_a, stalk_a_slope), stalk_a],
      [stalk_a, Phaser.Point.add(stalk_a, stalk_a_slope),
        Phaser.Point.subtract(nubpoint, nubpoint_slope), nubpoint],
      [nubpoint, Phaser.Point.add(nubpoint, nubpoint_slope),
        Phaser.Point.subtract(stalk_b, stalk_b_slope), stalk_b],
      [stalk_b, Phaser.Point.add(stalk_b, stalk_b_slope),
        new Phaser.Point(0.8,0).perturb(p,p/2), new Phaser.Point(1,0)],
      //[nubpoint, nubpoint, nubpoint, new Phaser.Point(1,0)],
    ];
      /*[A, AA, nub_stalk_A_approach, nub_stalk_A],
      [nub_stalk_A, nub_stalk_A_climb, nub_A, nubpoint],
      [nubpoint, nub_B, BB, B]];*/
    //console.log(JSON.stringify(bpaths));
    return bpaths;
  };
  var _piece_border_id = 0;
  this.PieceBorder = function(p1, p2, straight_line){
    this.id = ++_piece_border_id;
    // randomize direction.
    if (Math.random() > 0.5) {
      this.corner2 = p2;
      this.corner1 = p1;
    }else{
      this.corner1 = p2;
      this.corner2 = p1;
    }

    this.getPaths = function(){ //not a copy so be careful
      if(this._paths)
        return this._paths;
      if (straight_line === true){
        this._paths = [[this.corner1, this.corner1, this.corner2, this.corner2]];
        return this._paths;
      }
      //this._paths = this.squiggle(); // [[bz],[bz],...]
      var squig = puz.squiggle(); // [[bz],[bz],...]
      var first_squig_point = squig[0][0];
      var last_squig_point = squig[squig.length-1][3];
      var squig_vector = Phaser.Point.subtract(last_squig_point, first_squig_point);
      var border_vector = Phaser.Point.subtract(this.corner2, this.corner1);
      var angle = Phaser.Point.angle(border_vector, squig_vector); //in radians
      //angle prolly pi/2 or 0;
      var scale = border_vector.getMagnitude() / squig_vector.getMagnitude();
      for(var i=0; i < squig.length; i++){
        for (var j=0; j < 4; j++){
          var p = Phaser.Point.subtract(squig[i][j], first_squig_point);//probably 0,0 anyways
          p.rotate(0,0,angle, false);
          p.multiply(scale, scale);
          squig[i][j] = Phaser.Point.add(p, this.corner1);
        }
      }
      this._paths = squig;
      return this._paths;
    };
  };
  //calculate this at the beginning so that it doesn't change on resize
  this.get_stroke_width = function(){
    if (this._stroke_width)
      return this._stroke_width;
    this._stroke_width = 1.3 * (game.width / 800);
    if (this.pattern_type != "color")
      this._stroke_width /= this.img_scale;
    return this._stroke_width;
  }

  //different pieces glommed together (or just one piece) make a globule
  // extends piece.
  this.Globule = function(original_piece){
    this.pieces = [original_piece]; // single pieces
    this.borders = [];
    this._neighbors = [];

    //if the same border is contained twice then it's not drawn.
    this._border_instances = {};
    this.incrementBorderInstances = function(borders){
      borders.forEach(function(bd){
        //if (! bd.id in this._border_instances)
        if (! this._border_instances.hasOwnProperty(bd.id))
          this._border_instances[bd.id] = 0;
        this._border_instances[bd.id] += 1;
      }, this);
    };
    this.incrementBorderInstances(original_piece.getBorders());

    this.getBorders = function(){
      var ret = [];
      this.pieces.forEach(function(pc){
        pc.getBorders().forEach( function(bd){
          if (this._border_instances[bd.id] === 1)
            ret.push(bd);
        }, this);
      }, this);
      return ret;
    };

    this.glomGlobule = function(glob2){ // merge with another globule.
      var b1 = this.getBounds();
      var b2 = glob2.getBounds();
      var bu = Phaser.Rectangle.union(b1,b2);
      this.incrementBorderInstances(glob2.getBorders()); // merge borders
      glob2.pieces.forEach(function(pc){ //push pieces
        this.pieces.push(pc);
      }, this);
      this._neighbors.push.apply(this._neighbors, glob2._neighbors);
      glob2.parent = this;
      if(bu.x < b1.x)
        this.cx -= (b1.x - bu.x);
      if(bu.y < b1.y)
        //this.cy = bu.y;
        this.cy -= b1.y - bu.y;

      let pin_to_back = false;
      if (this._sprite.pinned == true || glob2._sprite.pinned == true)
        pin_to_back = true;

      this._sprite.destroy();
      glob2._sprite.destroy();
      this.genSprite();
      if (pin_to_back){
        this._sprite.pinned = true;
        this._sprite.sendToBack();
      }
      puz.n_globs--;
      if (puz.n_globs == 1) //victory, whoop de doo!
        puz.fin_cb();
      puz.glom_cb();
    };

    this.checkForGlomming = function(){
      var neighbors = this.findActualNeighbors();
      var d1 = this.getDisp();
      neighbors.forEach(function(n){
        var d2 = n.getDisp();
        var dist = Phaser.Point.distance(d1,d2);
        if (dist < (5 * game.width / 800))
          this.glomGlobule(n);
          //n.glomGlobule(this);
      }, this);

    };
    this.findActualNeighbors = function(){
      var ret = [];
      this._neighbors.forEach(function(n){
        // n = puz.ultimateGlobule(n);
        while(n.parent) // if it's absorbed, find the superglobule
          n = n.parent;
        if (ret.includes(n))
          return;
        if (n === this)
          return;
        ret.push(n);
      }, this);
      this._neighbors = ret;
      return ret;
    };

    this.getDisp = function(){
      var bounds = this.getBounds();
      var should_be = bounds.topLeft;
      var is = new Phaser.Point(this.cx, this.cy);
      return Phaser.Point.subtract(is, should_be);
      //bounds.topleft is where it "should be"
      //glob.{cx,cy} is where it is.
      //where it is minus where it should be is the displacement.
    };
    this.genTexture = function(){
      //var borderDirection = [0,0,1,1];
      var borders = this.getBorders();

      // need to find a route around the glob.
      var bd_from_pt = {}; // look up borders from points
      for (var bd in borders){ // vivify & clear flags
        bd_from_pt[borders[bd].corner1.id] = [];
        bd_from_pt[borders[bd].corner2.id] = [];
        borders[bd].flag_reverse = false;
        borders[bd].flag_begin_path = false;
      }
      for (bd in borders){
        bd_from_pt[borders[bd].corner1.id].push(borders[bd]);
        bd_from_pt[borders[bd].corner2.id].push(borders[bd]);
      }
      var route = [];
      while(route.length < borders.length){
        // get first border not in route.
        var starting_border;
        for (var i in borders){
          var bd = borders[i];
          if (! route.includes(bd)){
            starting_border = bd;
            break;
          }
        }
        starting_border.flag_begin_path = true;
        route.push(starting_border);
        while(1){
          var prev_bd = route[route.length-1];
          var next_pt = prev_bd.corner2;
          if (prev_bd.flag_reverse)
            next_pt = prev_bd.corner1;
          var next_bd = undefined; // jeez, no block scope in this language.
          var next_bd_candidates = bd_from_pt[next_pt.id];
          for (i in next_bd_candidates){
            if (route.includes(next_bd_candidates[i]))
              continue;
            next_bd = next_bd_candidates[i];
            if (next_bd.corner2 === next_pt)
              next_bd.flag_reverse = true;
            break;
          }
          if (! next_bd){
            //console.log("loopyness");
            break;
            //completed a loop. there may be an internal loop or something.
            //if so the process will repeat with a start flag.
          }
          route.push(next_bd);
          //console.log(route);
        }
      }

      var bounds = this.getBounds();
      var piece_disp = bounds.topLeft;

      var canvas_buffer = new PIXI.CanvasBuffer(bounds.width, bounds.height);
      var context = canvas_buffer.context;
      var in_path = false;

      for (var i in route){ //draw the curve on the canvas
        var bd = route [i];
        var reversed = bd.flag_reverse;
        var paths = bd.getPaths().slice();

        if(reversed)
          paths.reverse();

        var begin = false;
        if (bd.flag_begin_path){
          begin = true;
        }
        for (var foo = 0; foo < paths.length; foo++){
          var bezier = paths[foo];
          var bz = bezier.slice(); // copy to perhaps reverse and make relative to piece buffer
          for(var j=0;j<4;j++)
            bz[j] = Phaser.Point.subtract(bz[j], piece_disp);
          if (reversed)
            bz.reverse();
          if (foo == 0 && begin){
            if (i > 0)
              context.closePath(); // call this every time we need to jump
            if(i == 0) // first in route
              context.beginPath();
            context.moveTo(bz[0].x, bz[0].y);
          }

          context.bezierCurveTo(bz[1].x, bz[1].y, bz[2].x, bz[2].y, bz[3].x, bz[3].y);
        };
      };
      //context.closePath();

      //fill it in with the image or color
      context.save();
      context.lineWidth = puz.get_stroke_width();
      if (puz.pattern_type == "color"){
        if (puz.pattern_color == "random")
          context.fillStyle = "#000000".replace(/0/g,function(){return (~~(Math.random()*16)).toString(16);});
        else 
          context.fillStyle = puz.pattern_color;
      } else {
        context.translate(-piece_disp.x, -piece_disp.y);
        context.scale(puz.img_scale, puz.img_scale);
        let pat = context.createPattern(puz.source_canvas, "no-repeat");
        context.fillStyle = pat;
      }
      context.fill("evenodd");
      context.strokeStyle = "#111111";
      context.stroke();
      context.restore();
      return canvas_buffer;
    }

    this.genSprite = function(){
      var piece_canvas = this.genTexture();
      var tex = PIXI.Texture.fromCanvas(piece_canvas.canvas);
      var sprite = puz.game.add.sprite(this.cx,this.cy, tex);
      puz.group.add(sprite);
      sprite.inputEnabled = true;
      sprite.input.enableDrag();
      //sprite.input.boundsRect = puzzle.game.camera;
      sprite.input.pixelPerfectAlpha = 128;
      sprite.input.pixelPerfectClick = true;
      sprite.input.bringToTop = false;
      var globbo = this;
      sprite.events.onDragStart.add( (spr,ptr) => {
        // if it's a middle mouse button drag, cancel the drag and send the sprite to the back.
        if (ptr.middleButton.isDown && ptr.leftButton.isUp && ptr.rightButton.isUp){
          sprite.input.stopDrag(ptr);
          sprite.pinned = true;
          sprite.sendToBack();
        }
        else{
          sprite.pinned = false;
          sprite.bringToTop();
        }
        puz.drag_start_cb();
      }, this);
      sprite.events.onDragStop.add(function(item, pointer){
        globbo.cx = item.x;
        globbo.cy = item.y;
        globbo.checkForGlomming();
        puz.drag_stop_cb();
      });
      //when game scales, it moves the pieces around to fit
      // by calling sprite.move_piece_to(x,y)
      sprite.move_piece_to = function(x,y){
        this.x = x;
        this.y = y;
        globbo.cx = x;
        globbo.cy = y;
      }
      this._sprite = sprite;

      return sprite;
    };
  };

  this.Globule.prototype = new this.Piece();

  var corner_ids = 0;
  var piece_corners = [];
  var x,y;
  var cp = .06; // corner perturbation
  for (x=0; x<=this.pw; x++){
    piece_corners.push([]);
    for (y=0; y<=this.ph; y++){
      var ix = this.apw * x;
      var iy = this.aph * y;
      piece_corners[x][y] = new Phaser.Point(ix,iy);
      piece_corners[x][y].id = corner_ids++;
      if (x != 0 && x != this.pw)
        piece_corners[x][y].perturb(this.apw*cp,0);
      if (y != 0 && y != this.ph)
        piece_corners[x][y].perturb(0,this.aph*cp);
    }
  }
  //console.log(piece_corners);
  //console.log(this);

  //generate borders between pieces and at the sides of the image.
  // horz first
  var horz_piece_borders = [];
  for (x = 0; x < this.pw; x++){
    horz_piece_borders.push([]);
    for (y = 0; y <= this.ph; y++){
      var straight = false;
      if (y===0 || y===this.ph)
        straight = true;
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x+1][y], straight);
      horz_piece_borders[x][y] = pb;
    }
  }
  // now vertical piece borders.
  var vert_piece_borders = [];
  for (x = 0; x <= this.pw; x++){
    vert_piece_borders.push([]);
    for (y = 0; y < this.ph; y++){
      var straight = false;
      if (x===0 || x===this.pw)
        straight = true;
      var pb = new this.PieceBorder(piece_corners[x][y], piece_corners[x][y+1], straight);
      vert_piece_borders[x][y] = pb;
    }
  }

  this.glob_layout = [];

  //initialize puzzle by generating pieces.
  for (x = 0; x < this.pw; x++){
    this.glob_layout[x] = [];
    for (y = 0; y < this.ph; y++){
      var borders = [
        horz_piece_borders[x][y],
        vert_piece_borders[x+1][y],
        horz_piece_borders[x][y+1],
        vert_piece_borders[x][y]
      ];
      var s_piece = new this.SinglePiece(x,y,borders);

      var glob = new this.Globule(s_piece);
      puz.n_globs++;
      this.glob_layout[x][y] = glob;
      //give it a random position on the canvas.
      if(puz.game){
        glob.cx = puz.game.rnd.between(100, puz.game.width-100);
        glob.cy = puz.game.rnd.between(100, puz.game.height-100);
        glob.cx -= puz.apw / 2;
        glob.cy -= puz.aph / 2;
        glob.genSprite();
      }
    }
  }
  for (x = 0; x < this.pw-1; x++){
    for (y = 0; y < this.ph; y++){
      this.glob_layout[x][y]._neighbors.push( this.glob_layout[x+1][y] );
      this.glob_layout[x+1][y]._neighbors.push( this.glob_layout[x][y] );
    }
  }
  for (x = 0; x < this.pw; x++){
    for (y = 0; y < this.ph-1; y++){
      this.glob_layout[x][y]._neighbors.push( this.glob_layout[x][y+1] );
      this.glob_layout[x][y+1]._neighbors.push( this.glob_layout[x][y] );
    }
  }

  this.game_resized = function(){
    console.log('resized!');
    for (let glob_sprite of this.group.children){
      let to_x = glob_sprite.x * game.width / this.pre_resize_dims[0];
      let to_y = glob_sprite.y * game.height/ this.pre_resize_dims[1];
      glob_sprite.move_piece_to(to_x, to_y);
    }
    this.pre_resize_dims = [this.game.width,this.game.height];
  }
};
Puzzle.genPieceCanvasBuffer = function(size, color, perturbation){
  let what_to_cut = {color:color, width:size*3, height:size*3};
  let how_to_cut = {dims: [3,3]};
  if(perturbation)
    how_to_cut.perturbation = perturbation;
  let p= new Puzzle(null, what_to_cut, how_to_cut);
  return p.glob_layout[1][1].genTexture();

};


