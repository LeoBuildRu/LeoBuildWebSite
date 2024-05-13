import { ExportSceneSettings } from './modules/SceneSettings.js';
import { ExportMaterialSettings } from './modules/MaterialSettings.js';

var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
engine.enableAntialiasing = true; // применяем сглаживание для сцены
engine.samples = 100; // устанавливаем сглаживание на 100

var createScene = function() {
	
	// создание настроек для присвоения им импортного значения и дальнейшего использования
	var scene = new BABYLON.Scene(engine);
	var camera = new BABYLON.ArcRotateCamera("camera1",  0, 0, 0, new BABYLON.Vector3(0, 0, 0), scene);
	var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 1), scene);
	var plane = BABYLON.Mesh.CreateGround("ground", 1000, 1000, 1, scene);
	var plane_material = new BABYLON.StandardMaterial("material1", scene);

	// импорт настроек сцены из SceneSettings.js
	const SceneArguments = ExportSceneSettings(canvas, engine, scene, camera, light, plane, plane_material); 

	// присвоение настройкам сцены их импортного значения
	scene = SceneArguments.scene; camera = SceneArguments.camera; light = SceneArguments.light; plane = SceneArguments.plane; plane_material = SceneArguments.plane_material; 


	// создание материала для присвоения ему импортного значения и дальнейшего использования
	var redMaterial = new BABYLON.StandardMaterial("ground", scene); 
	var blueMaterial = new BABYLON.StandardMaterial("ground", scene);

	//импорт настроек материалов из MaterialSettings.js
	const MaterialArguments = ExportMaterialSettings(scene, redMaterial, blueMaterial); 

	// присвоение материалу его импортного значения
	redMaterial = MaterialArguments.redMaterial 
	blueMaterial = MaterialArguments.blueMaterial 

	builder(scene, plane, redMaterial, blueMaterial)

  	return scene;
};

//-------------- ОБЪЯВЛЕНИЕ ПЕРЕМЕННЫХ --------------//
var pickInfo, position; // координаты нажатия 
let points_array = []; // массив для позиций точек в формате вектор3
let points_array_ = []; // массив для хранения последних трёх позиций точек в формате вектор3

function builder(scene_, plane_, redMaterial_, blueMaterial_){

	var planeActionManager = new BABYLON.ActionManager(scene_);
	plane_.actionManager = planeActionManager;
	planeActionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, function (evt) {

		// Получаем координаты нажатия
		pickInfo = scene_.pick(scene_.pointerX, scene_.pointerY);
		position = pickInfo.pickedPoint;

		createSphere(position, redMaterial_)

	}));
}

function createSphere(position_, material_){
	
	// Создание sphere в позиции нажатия
	var sphere;

	sphere = BABYLON.MeshBuilder.CreateSphere("sphere", { segments: 32, diameter: 0.10 }, scene); //scene is 
	sphere.material = material_ // присваиваем материал сфере
	sphere.position = position_; // присваиваем позицию сфере

	points_array.push(sphere) // пуш в массив всех points
	points_array_.push(sphere) // пуш в массив последних трёх points для вычисления перпендикуляров и пересечений

}


var scene = createScene();
engine.runRenderLoop(function() {
	scene.render();
});
window.addEventListener("resize", function() {
	engine.resize();
});