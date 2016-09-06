var game;
var pointsArray = [];
var pointColors = ["0x00ff00", "0x008800", "0x880000", "0xff0000"];
var bezierGraphics;
var movingSprite;

var pieces = [];
var pw = 4;
var ph = 4;
function pieceXY(x,y){
  return pieces[y*pw + x];
}


window.onload = function() {
	game = new Phaser.Game(800, 500);
	game.state.add("PlayGame", playGame)
	game.state.start("PlayGame");	
}

var playGame = function(game){}
playGame.prototype = {
	preload: function(){
          game.load.image("point", "point.png");
          game.load.image("scream", "scream.jpg");
	},
	create: function(){
          for(var i = 0; i < 4; i++){
               var draggablePoint = game.add.sprite(game.rnd.between(100, game.width - 100), game.rnd.between(100, game.height - 100), "point");  
               draggablePoint.inputEnabled = true;
               draggablePoint.tint = pointColors[i];
               draggablePoint.input.enableDrag(); 
               draggablePoint.anchor.set(0.5);
               draggablePoint.events.onDragStart.add(startDrag);  
               draggablePoint.events.onDragStop.add(stopDrag);
               draggablePoint.events.onDragUpdate.add(updateDrag);      
               pointsArray[i] = draggablePoint; 
          }
          for(var i=0; i < pw*ph; i++){
            var piece = game.add.sprite(game.rnd.between(100, game.width-100), game.rnd.between(100, game.height-100), "scream");
            piece.inputEnabled = true;
            piece.tint = "0x005500";
            pieces[i] = piece;
          }
          bezierGraphics = this.game.add.graphics(0, 0);
          updateDrag();
          stopDrag();
	}
}

function startDrag(){
     movingSprite.destroy();     
}

function stopDrag(){
     movingSprite = game.add.sprite(pointsArray[0].x, pointsArray[0].y, "point");   
     movingSprite.scale.set(0.5);   
     movingSprite.anchor.set(0.5);
     var tween = game.add.tween(movingSprite).to({
          x: [pointsArray[0].x, pointsArray[1].x, pointsArray[2].x, pointsArray[3].x],
          y: [pointsArray[0].y, pointsArray[1].y, pointsArray[2].y, pointsArray[3].y],
     }, 5000,Phaser.Easing.Quadratic.InOut, true, 0, -1).interpolation(function(v, k){
          return Phaser.Math.bezierInterpolation(v, k);
     }); 
}

function updateDrag(){
     bezierGraphics.clear();
     bezierGraphics.lineStyle(2, 0x008800, 1);  
     bezierGraphics.moveTo(pointsArray[1].x, pointsArray[1].y); 
     bezierGraphics.lineTo(pointsArray[0].x, pointsArray[0].y); 
     bezierGraphics.lineStyle(2, 0x880000, 1)
     bezierGraphics.moveTo(pointsArray[3].x, pointsArray[3].y); 
     bezierGraphics.lineTo(pointsArray[2].x, pointsArray[2].y);
     bezierGraphics.lineStyle(4, 0xffff00, 1);
     bezierGraphics.moveTo(pointsArray[0].x, pointsArray[0].y);
     for (var i=0; i<1; i+=0.01){
          var p = bezierPoint(pointsArray[0], pointsArray[1], pointsArray[2], pointsArray[3], i);
          bezierGraphics.lineTo(p.x, p.y);
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
