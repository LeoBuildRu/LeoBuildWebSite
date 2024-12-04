import { ExportSceneSettings } from './modules/SceneSettings.js';
import { ExportMaterialSettings } from './modules/MaterialSettings.js';
import * as flatted from 'https://cdn.jsdelivr.net/npm/flatted@3.3.1/+esm';
BABYLON.SceneLoader.ShowLoadingScreen = false;


var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
engine.enableAntialiasing = true; // применяем сглаживание для сцены
engine.samples = 100; // устанавливаем сглаживание на 100
var scene = new BABYLON.Scene(engine);

// создание материала для присвоения ему импортного значения и дальнейшего использования
var redMaterial = new BABYLON.StandardMaterial("ground", scene); 
var blueMaterial = new BABYLON.StandardMaterial("ground", scene);
var doubleFaceMaterial = new BABYLON.StandardMaterial("material", scene);
var FloorDefaultMaterial = new BABYLON.StandardMaterial("material", scene);
var WallDefaultMaterial = new BABYLON.StandardMaterial("material", scene);

// создание настроек для присвоения им импортного значения и дальнейшего использования
var camera = new BABYLON.ArcRotateCamera("camera1",  0, 0, 0, new BABYLON.Vector3(0, 0, 0), scene);
var light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 1), scene);
var plane = BABYLON.Mesh.CreateGround("ground", 1000, 1000, 1, scene);
var plane_material = new BABYLON.StandardMaterial("material1", scene);

// импорт настроек сцены из SceneSettings.js
const SceneArguments = ExportSceneSettings(canvas, engine, scene, camera, light, plane, plane_material); 

// присвоение настройкам сцены их импортного значения
scene = SceneArguments.scene; camera = SceneArguments.camera; light = SceneArguments.light; plane = SceneArguments.plane; plane_material = SceneArguments.plane_material; 

//импорт настроек материалов из MaterialSettings.js
const MaterialArguments = ExportMaterialSettings(scene, redMaterial, blueMaterial, doubleFaceMaterial, FloorDefaultMaterial, WallDefaultMaterial); 

// присвоение материалу его импортного значения
redMaterial = MaterialArguments.redMaterial 
blueMaterial = MaterialArguments.blueMaterial 
doubleFaceMaterial = MaterialArguments.doubleFaceMaterial 
FloorDefaultMaterial = MaterialArguments.FloorDefaultMaterial 
WallDefaultMaterial = MaterialArguments.WallDefaultMaterial 

//// Обработчик для сохранения сцены
//document.getElementById("saveScene").onclick = function() {
//	saveScene();
//};
//
//document.getElementById("loadScene").onclick = function() {
//	loadScene();
//};
//function clearScene(_scene) {
//	// Удаляем все меши из сцены
//	for (let i = 1; i < _scene.meshes.length; i++) {
//		_scene.meshes[i].dispose();
//	}
//
//	// Удаляем освещение
//	_scene.lights.forEach(function(light) {
//		light.dispose();
//	});
//
//	// Очистка остальных объектов, если необходимо
//	//_scene.materials.forEach(function(material) {
//	//    material.dispose();
//	//});
//}
//
//// Сохранение сцены
//function saveScene() {
//	const flattedScene = BABYLON.SceneSerializer.Serialize(scene); // Сериализация сцены
//	console.log(flattedScene)
//	fetch('/save_scene/', {
//		method: 'POST',
//		headers: {
//			'Content-Type': 'application/json',
//		},
//		body: JSON.stringify(flattedScene)
//	})
//	.then(response => response.json())
//	.then(data => {
//		if (data.status === 'success') {
//			console.log('Scene saved successfully.');
//		} else {
//			console.error('Error saving scene:', data.message);
//		}
//	});
//}
//
//function loadScene() {
//	clearScene(scene);
//	BABYLON.SceneLoader.Append("http://127.0.0.1:8000/", "scene.babylon", scene, function (newMeshes) {
//		scene.meshes[1].dispose()
//		
//	}, null, function (scene, message) {
//		console.error("Ошибка загрузки:", message);
//	});
//	console.log(scene)
//}

//-------------- ОБЪЯВЛЕНИЕ ПЕРЕМЕННЫХ --------------//
var planeActionManager
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // переменная для генерации рандомного ID состоящего из 16 символов
var MeshUniqueId = ''; // уникальный ID для каждой сферы
var wall_click_counter = 0; // обозначает сколько всего кликов было сделано
var wall_points_counter = 0; // обозначает сколько кликов для создания стен было сделано
var pickInfo, position; // координаты нажатия 
let wall_points_array = []; // массив для позиций точек в формате вектор3
let wall_points_array_ = []; // массив для хранения последних трёх позиций точек в формате вектор3
let floor_points_array = []; // массив для позиций точек в формате вектор3
let floor_points_array_ = []; // массив для хранения последних трёх позиций точек в формате вектор3
var posOx, posOz, posTx, posTz; // posOx и posOz - первая точка для выстраивания вектора | posTx и posTz - вторая точка для выстраивания вектора
var dx, dz, len, udx, udz, nx, nz; // значения calculateNormal для выстраивания перпендикуляра
var wallWidth = 0.50; // ширина стены
var wallHeight = 3.00; // высота стены
var pointO, pointT // точки для построения линии
var line; // линия, для нахождения пересечений
var pointsLI; // массив для заточения в него точек для последующего создания линии
let LinePointsO_arr = [], LinePointsT_arr = [];
let wall_lines_array = []; // массив для позиций всех линий в формате uniqIDline { f: s: t: }
let wall_lines_array_ = []; // массив для хранения последних четырёх линий в формате uniqIDline { f: s: t: }
let floor_lines_array = []; // массив для позиций всех линий в формате uniqIDline { f: s: t: }
let floor_lines_array_ = []; // массив для хранения последних четырёх линий в формате uniqIDline { f: s: t: }
var center_point_x, center_point_z, middleVector; // центральная точка между двумя points - служит для построения центрального перпендикуляра(построение вектора пересечения)
var middlePointO, middlePointT; // серединные точки между концами линий
var farthestPoint, farthestDistanceSquared, referencePoint, distanceSquared // объявление переменных для функции нахождения точек линии для создания пересечений
let endPoints = []; // массив точек для создания пересечений
var c2x, c3x, c2z, c3z, d, u1, u4, px, pz, p, p1I, p2I, p3I, p4I; // переменные функции нахождения персечений
var interP; // точка пересечения
var TargetLine; // Переменная обозначающая, которая линия пересекается первой
let intersectedLines = []; // массив всех линий с одним ValCombination
let intersectedLines_ = []; // массив всех линий с одним ValCombination за исключением ново-созданных
let TargetintersectedLine = []; 
let AnotherIntersectedLine = [];
let exclusive_array = [];
var intersectedLineId;
var intersectionValidator;
let WallPoints = [];
let WallVertexData = [];
let WallMesh_array = [];
let WallMesh_array_ = [];
var globalStart = new BABYLON.Vector3(0, 0, 0);
var globalEnd = new BABYLON.Vector3(-1, 0, 0);
var pointStart;
var pointEnd;
var diffVector, distance;
var vectorO, vectorT, dotProduct, angle, crossProduct, sign, degrees, fullAngle;
let SideWallMesh_array = [];
let SideWallMesh_array_ = [];
var targetValCombination;
var targetMesh;
var check_mark;
var check_markPosition;
var startingPoint;
var currentMesh;
let subtract_array = [];
let foundIntersection = false; // Флаг для отслеживания пересечения меша со стеной
let trianglePoints = []
var endingOptions = { WallCreateValidator: false, FloorCreateValidator: false, PointValidator: 'MAIN', SphereValidator: 'BUILDING', CompletionValidator: false };
var valueEndPointConstruction = 0;
var target_Elem;
var target_Index;
let sprites_array = [];
let subjectSprite_array = [];
var movingOptions = { permission: false, isMovingUp: false, isMovingDown: false, isRotateLeft: false, isRotateRight: false } // переменная опций разрешения движения мешей при нажатии на спрайт
// Переменные для ускорения, скорости и максимальной скорости позиции меша при нажатии на спрайт
var acceleration = 0.001; // Регулируйте это значение для изменения ускорения
var maxSpeed = 0.05; // Максимальная скорость
var speedUp = 0; 
var speedDown = 0;
var speedLeft = 0; 
var speedRight = 0;
//-------------------------
var target_compatibility;
var model_array = [];
var targetModel;
var floor_click_counter = 0;
var mergedMesh_arr = [] // массив объединённых боковых сторон 3Д модели
var sideModal_arr_ = [] // массив для объединения боковых сторон 3Д модели в один меш
var toggleUI = 0; // переменная изменения видимости сеток и поинтов
var boundingInfo
var dimensions
var materialValidator = false;
var materialToken = false;
var EndMaterialSprite;
var materialPath;
var ModelCategory
var modelWidth, modelHeight, modelDipth;



//-------------- TEST SEGMENT --------------//
var testARR = [];
var testARR_ = [];
var testSprite;
var materialMESH;
var pickValidator = true;

window.handleProductResponse = function(product, token_) {

	ModelCategory = token_

	if(product.material_url){
		materialToken = true;
		materialPath = product.material_url.split("/application").join("");
	}

	modelWidth = Number(product.width)
	modelHeight = Number(product.height)
	modelDipth = Number(product.depth)

	if(!product.material_url){
	function createCIL(posX, posY, posZ){
		var TESTcylinder = BABYLON.MeshBuilder.CreateBox("box", {width: (modelWidth * 2 + 0.02), height: (modelHeight * 2 + 0.02), depth: (modelDipth * 2 + 0.02)}, scene);
		TESTcylinder.material = new BABYLON.StandardMaterial("cylinderMaterial", scene);
		TESTcylinder.material.wireframe = true;
		TESTcylinder.position.x = posX
		TESTcylinder.position.y = posY
		TESTcylinder.position.z = posZ
		TESTcylinder.sizeProperty = {width: (modelWidth * 2 + 0.02), height: (modelHeight * 2 + 0.02), depth: (modelDipth * 2 + 0.02)}
		TESTcylinder.property = 'TESTING';
		TESTcylinder.immovable = true
		TESTcylinder.testValue = 0;

		
		createSideWallModel(TESTcylinder, (modelDipth * 2 + 0.01), (modelHeight * 2 + 0.01), 0.0005, (modelWidth), 0, 'plus')
		createSideWallModel(TESTcylinder, (modelDipth * 2 + 0.01), (modelHeight * 2 + 0.01), 0.0005, (modelWidth), 0, 'minus')
		createSideWallModel(TESTcylinder, (modelDipth * 2 + 0.01), 0.0005, (modelWidth * 2 + 0.01), 0, (modelHeight), 'plus')
		createSideWallModel(TESTcylinder, (modelDipth * 2 + 0.01), 0.0005, (modelWidth * 2 + 0.01), 0, (modelHeight), 'minus')

		var mergedMesh = BABYLON.Mesh.MergeMeshes(sideModal_arr_);
		mergedMesh.depth = (modelDipth * 2 + 0.02)
		mergedMesh.metadata = { height: modelHeight }
		mergedMesh.visibility = 0;
		mergedMesh_arr.push(mergedMesh)

		for (var i = 0; i < sideModal_arr_.length; i++) {
			sideModal_arr_[i].dispose();
		}
		sideModal_arr_ = [];

		return { CilMesh: TESTcylinder, sideCilMesh: mergedMesh};
	}

	MeshUniqueId = 0;

	// функция генерации уникального ID сфере
	for (let i = 0; i < characters.length; i++) {
		var randomIndex = Math.floor(Math.random() * characters.length);
		MeshUniqueId += characters.charAt(randomIndex);
	}

	var combinedMeshes = createCIL(0, modelHeight, 0);
	combinedMeshes.CilMesh.immovablePermission = false;

	var _sprite_ = createSprite("/static/img/sprite-group-1.png", 0.4, 'HIDE SPRITES', 3)
	_sprite_.cellIndex = 0;
	_sprite_.compatibility = MeshUniqueId;
	_sprite_.isVisible = false
	_sprite_.isPickable = false
	sprites_array.push(_sprite_)

	var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(-0.4, -0.3, 0), new BABYLON.Vector3(0.4, 0.3, 0), MeshUniqueId, _sprite_);
	subjectSprite_array.push(_subjectSprite_)

	var _sprite_ = createSprite("/static/img/sprite-group-1.png", 0.4, 'DELETE', 3)
	_sprite_.cellIndex = 1;
	_sprite_.compatibility = MeshUniqueId;
	_sprite_.isVisible = false
	_sprite_.isPickable = false
	_sprite_.modelID = product.item_id
	sprites_array.push(_sprite_)

	var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(0.4, -0.3, 0), new BABYLON.Vector3(-0.4, 0.3, 0), MeshUniqueId, _sprite_);
	subjectSprite_array.push(_subjectSprite_)

	if (product.item_type == 'mesh' && product.mesh_subtype == 'subtract') {

		var _sprite_ = createSprite("/static/img/sprite-group-2.png", 0.4, 'UP', 3)
		_sprite_.cellIndex = 1;
		_sprite_.compatibility = MeshUniqueId;
		_sprite_.isVisible = false
		_sprite_.isPickable = false
		sprites_array.push(_sprite_)

		var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(-0.8, 0.3, 0), new BABYLON.Vector3(0.8, -0.3, 0), MeshUniqueId, _sprite_);
		subjectSprite_array.push(_subjectSprite_)

		var _sprite_ = createSprite("/static/img/sprite-group-2.png", 0.4, 'DOWN', 3)
		_sprite_.cellIndex = 0;
		_sprite_.compatibility = MeshUniqueId;
		_sprite_.isVisible = false
		_sprite_.isPickable = false
		sprites_array.push(_sprite_)

		var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(0.8, 0.3, 0), new BABYLON.Vector3(-0.8, -0.3, 0), MeshUniqueId, _sprite_);
		subjectSprite_array.push(_subjectSprite_)

		var _sprite_ = createSprite("/static/img/rotate180.png", 0.8, 'ROTATE180', 3)
		_sprite_.cellIndex = 0;
		_sprite_.compatibility = MeshUniqueId;
		_sprite_.isVisible = false
		_sprite_.isPickable = false
		sprites_array.push(_sprite_)

		var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(-0.4, 1.2, 0), new BABYLON.Vector3(0.4, -1.2, 0), MeshUniqueId, _sprite_);
		subjectSprite_array.push(_subjectSprite_)

		var _sprite_ = createSprite("/static/img/reflection.png", 0.45, 'REFLECTION', 3)
		_sprite_.cellIndex = 0;
		_sprite_.compatibility = MeshUniqueId;
		_sprite_.isVisible = false
		_sprite_.isPickable = false
		sprites_array.push(_sprite_)

		var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(0.5, 1.2, 0), new BABYLON.Vector3(-0.5, -1.2, 0), MeshUniqueId, _sprite_);
		subjectSprite_array.push(_subjectSprite_)

		combinedMeshes.CilMesh.meshType = 'windowMesh';

	}

	if (product.item_type == 'mesh' && product.mesh_subtype == 'default') {

		var _sprite_ = createSprite("/static/img/sprite-group-3.png", 0.4, 'LEFT', 3)
		_sprite_.cellIndex = 0;
		_sprite_.compatibility = MeshUniqueId;
		_sprite_.isVisible = false
		_sprite_.isPickable = false
		sprites_array.push(_sprite_)

		var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(-0.8, 0.3, 0), new BABYLON.Vector3(0.8, -0.3, 0), MeshUniqueId, _sprite_);
		subjectSprite_array.push(_subjectSprite_)

		var _sprite_ = createSprite("/static/img/sprite-group-3.png", 0.4, 'RIGHT', 3)
		_sprite_.cellIndex = 1;
		_sprite_.compatibility = MeshUniqueId;
		_sprite_.isVisible = false
		_sprite_.isPickable = false
		sprites_array.push(_sprite_)

		var _subjectSprite_ = createSubjectSprite(combinedMeshes.CilMesh, new BABYLON.Vector3(0.8, 0.3, 0), new BABYLON.Vector3(-0.8, -0.3, 0), MeshUniqueId, _sprite_);
		subjectSprite_array.push(_subjectSprite_)

		combinedMeshes.CilMesh.meshType = 'defoltMesh';

	}

	BABYLON.SceneLoader.ImportMesh("", product.model_url, product.model_name, scene, function (meshes) {
		combinedMeshes.CilMesh.immovablePermission = true;
		meshes[0].id = MeshUniqueId;
		meshes[0].scaling.x = 1;
		meshes[0].position = combinedMeshes.CilMesh.position;
		meshes[0].rotationQuaternion = BABYLON.Quaternion.FromEulerVector(combinedMeshes.CilMesh.rotation);
		model_array.push(meshes[0]);
	});

	//BABYLON.SceneLoader.ImportMesh("", "", "/static/models/GLTF/window/wiindow.gltf", scene, function (meshes) {
	//	combinedMeshes.CilMesh.immovablePermission = true;
	//	meshes[0].id = MeshUniqueId;
	//	meshes[0].scaling.x = 1;
	//	meshes[0].position = combinedMeshes.CilMesh.position;
	//	meshes[0].rotationQuaternion = BABYLON.Quaternion.FromEulerVector(combinedMeshes.CilMesh.rotation);
	//	model_array.push(meshes[0]);
	//});

	combinedMeshes.CilMesh.id = MeshUniqueId;
	subtract_array.push(combinedMeshes.CilMesh);

	combinedMeshes.sideCilMesh.id = MeshUniqueId;
	}
};

document.getElementById('CreateWall').addEventListener('click', (e)=> {
	endingOptions.WallCreateValidator = true
});

document.getElementById('CreateFloor').addEventListener('click', (e)=> {
	endingOptions.FloorCreateValidator = true
});

document.getElementById('wall-width-accept').addEventListener('click', function() {
	// Получаем значение input
	wallWidth = document.getElementById('wall-width-value').value/2;
});

document.getElementById('wall-height-accept').addEventListener('click', function() {
	// Получаем значение input
	wallHeight = document.getElementById('wall-height-value').value;
});

document.getElementById('ChangeUI').addEventListener('click', function() {
	toggleUI++;
	if(toggleUI % 2 === 1){
		subtract_array.forEach(wireframe => {
			wireframe.visibility = 0;
		})
		wall_points_array.forEach(wall_point => {
			wall_point.isVisible = false;
		})
	} else {
		subtract_array.forEach(wireframe => {
			wireframe.visibility = 1;
		})
		wall_points_array.forEach(wall_point => {
			wall_point.isVisible = true;
		})
	}
});


	/// TEST+++ ///


	scene.onBeforeRenderObservable.add(() => {
		for(let i = 0; i < subjectSprite_array.length; i++){
			var direction = scene.activeCamera.getDirection(BABYLON.Axis.Z).scale(-1);
			subjectSprite_array[i].lookAt(subjectSprite_array[i].position.add(direction), 0, 0, Math.PI);
		}
	});

	/// TEST--- ///
	scene.onPointerDown = function (event, pickResult, pickSprite, pickMesh) {

		pickMesh = pickResult;
		pickSprite = scene.pickSprite(this.pointerX, this.pointerY); // переводим pickResult в разряд чека спрайтов сцены

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'END MATERIAL'){
			materialToken = false;
			materialValidator = false;
			EndMaterialSprite.dispose();
		}

		function applyMaterial(ModelCategory_, materialPath_, pickMesh_) {
			const isWall = ModelCategory_ === "ОБОИ";
			const isFloor = ModelCategory_ === "ПОЛ";
		
			if ((isWall && pickMesh_.pickedMesh.setMaterial == "Wall") || (isFloor && pickMesh_.pickedMesh.setMaterial == "Floor")) {

				var TargetMaterial = new BABYLON.StandardMaterial("material", scene);
				TargetMaterial.diffuseTexture = new BABYLON.Texture(materialPath_, scene);
				TargetMaterial.backFaceCulling = false;
				pickMesh_.pickedMesh.material = TargetMaterial;
				setDefaultTexture(pickMesh_.pickedMesh, isWall ? 'Wall' : 'Floor', isWall ? 0.4 : 0.6);
		
				if (!materialValidator) {
					EndMaterialSprite = createSprite("/static/img/sprite-group-1.png", 0.4, 'END MATERIAL', 3);
					EndMaterialSprite.cellIndex = 0;
					EndMaterialSprite.isVisible = true;
					EndMaterialSprite.isPickable = true;
				}
		
				const position = pickMesh_.pickedMesh.getAbsolutePosition();
				EndMaterialSprite.position = position;
		
				materialValidator = true;
			}
		}
		
		if (materialToken === true) {
			applyMaterial(ModelCategory, materialPath, pickMesh);
		}
		

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'HIDE SPRITES'){
			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickMesh.pickedMesh.immovable = true;

					pickMesh.pickedMesh.testValue = 0;

					sprites_array[i].isVisible = false;
					sprites_array[i].isPickable = false;
					pickValidator = false;

				}
			}
		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'DELETE'){
			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

					sprites_array[i].dispose();

					removeItemFromArray(sprites_array, sprites_array[i])

					i = i - 1;

					createSubtractMesh();

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){

					subtract_array[i].dispose();
					removeItemFromArray(subtract_array, subtract_array[i])

					model_array[i].dispose();
					removeItemFromArray(model_array, model_array[i])

				}
			}

			// удаление боксов спрайтов
			for(let i = 0; i < subjectSprite_array.length; i++){
				if(subjectSprite_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					subjectSprite_array[i].dispose();
					removeItemFromArray(subjectSprite_array, subjectSprite_array[i])

					i = i - 1;

				}
			}

			for(let i = 0; i < mergedMesh_arr.length; i++){
				if(mergedMesh_arr[i].id == target_compatibility){

					mergedMesh_arr[i].dispose();
					removeItemFromArray(mergedMesh_arr, mergedMesh_arr[i])

				}
			}

			window.removeFromCart(pickSprite.pickedSprite.modelID);

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'UP'){
			
			movingOptions.permission = true;
			movingOptions.isMovingUp = true;
			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){
					targetMesh = subtract_array[i]
					targetModel = model_array[i]
				}
			}

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'DOWN'){
			
			movingOptions.permission = true;
			movingOptions.isMovingDown = true;
			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){
					targetMesh = subtract_array[i]
					targetModel = model_array[i]
				}
			}

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'LEFT'){
			
			movingOptions.permission = true;
			movingOptions.isRotateLeft = true;
			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){
					targetMesh = subtract_array[i]
					targetModel = model_array[i]
				}
			}

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'RIGHT'){
			
			movingOptions.permission = true;
			movingOptions.isRotateRight = true;
			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){
					targetMesh = subtract_array[i]
					targetModel = model_array[i]
				}
			}

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'ROTATE180'){

			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){

					subtract_array[i].rotation.y += Math.PI; // Углы Эйлера

					model_array[i].rotationQuaternion = BABYLON.Quaternion.FromEulerVector(subtract_array[i].rotation);

				}
			}

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'REFLECTION'){

			for(let i = 0; i < sprites_array.length; i++){
				if(sprites_array[i].compatibility == pickSprite.pickedSprite.compatibility){

					pickValidator = false;

					target_compatibility = sprites_array[i].compatibility

				}
			}

			for(let i = 0; i < subtract_array.length; i++){
				if(subtract_array[i].id == target_compatibility){

					model_array[i].scaling.x = -(model_array[i].scaling.x);

				}
			}

		}

		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'END FLOOR'){

			var polygon = BABYLON.MeshBuilder.CreatePolygon("plane", { shape: floor_points_array_ }, scene);
			polygon.position.y = 0.005

			polygon.immovable = true
			polygon.setMaterial = 'Floor';

			var clonedFloorMaterial = FloorDefaultMaterial.clone("clonedFloorMaterial");
			polygon.material = clonedFloorMaterial
			setDefaultTexture(polygon, 'Floor', 0.2);

			testSprite.isVisible = false;
			testSprite.isPickable = false;
			testSprite.dispose();

			endingOptions.FloorCreateValidator = false
			floor_click_counter = 0;

			floor_lines_array_.forEach(line_ => {
				line_.dispose();
			})
			floor_lines_array_ = [];
			floor_points_array_ = [];

		}

		if (pickValidator && pickMesh.pickedMesh) {		
			// Увеличиваем значение testValue, если оно меньше 2
			if (pickMesh.pickedMesh.testValue < 2) {
				pickMesh.pickedMesh.testValue += 1;
			}
		
			// Найти совместимые спрайты и сделать их видимыми и кликабельными
			sprites_array.forEach(sprite => {
				if (sprite.compatibility === pickMesh.pickedMesh.id) {
					sprite.isVisible = true;
					sprite.isPickable = true;
				}
			});
		
			// Разблокируем mesh, если testValue равно 2
			if (pickMesh.pickedMesh.testValue === 2) {
				pickMesh.pickedMesh.immovable = false;
			}
		} else if (!pickValidator && pickMesh.pickedMesh) {
			pickMesh.pickedMesh.immovable = true;
		}

		// проверяем, если спрайт действительно есть - запускаем процесс ресета настроек стен и удаления спрайта
		// в противном случае присваиваем к переменной pickResult значение пика по мешу
		if(pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.property == 'ENDING'){
			valueEndPointConstruction = SideWallMesh_array.length
			resetWallSettings();

			check_mark.dispose()
		}

		if (pickSprite && pickSprite.pickedSprite && pickSprite.pickedSprite.BegEnd === 'start' && endingOptions.WallCreateValidator == true) {
			targetMesh = pickSprite.pickedSprite; // присваиваем к переменной targetMesh значение кликнутого меша точки стены
			targetValCombination = pickSprite.pickedSprite.ValCombination.combination; // потсваиваем к переменной targetValCombination точки соответствия
			wall_click_counter += 1; // увеличиваем количество общих кликов локальной конструкции на 1
			wall_points_counter += 1; // увеличиваем количество кликов локальной конструкции на 1

			// Получаем координаты нажатия
			endingOptions.PointValidator = 'MAIN';
			endingOptions.SphereValidator = 'ENDING'
			endingOptions.CompletionValidator = true
			position = pickSprite.pickedSprite.position;
			createPoint(position, redMaterial)
			
			creating(1, 2);

			check_mark.dispose()
		}
		pickSprite = 0;
		pickValidator = true;

		if(pickMesh.pickedMesh && pickMesh.pickedMesh != plane && pickMesh.pickedMesh.immovable != true) {

			currentMesh = pickMesh.pickedMesh;
        	startingPoint = getGroundPosition(plane);
        	if (startingPoint) { // we need to disconnect camera from canvas
        	    setTimeout(function () {
        	        camera.detachControl(canvas);
        	    }, 0);
        	}

		}

	};

	scene.onPointerUp = function () {	
		
		if(startingPoint || movingOptions.isMovingUp == true || movingOptions.isMovingDown == true){
			createSubtractMesh();
			for(let i = 0; i < subjectSprite_array.length; i++){
				if(subjectSprite_array[i].compatibility == currentMesh.id){
					subjectSprite_array[i].position.x = (currentMesh.position.x + subjectSprite_array[i].positionProperty.x)
					subjectSprite_array[i].position.y = (currentMesh.position.y + subjectSprite_array[i].positionProperty.y)
					subjectSprite_array[i].position.z = (currentMesh.position.z + subjectSprite_array[i].positionProperty.z)
				}
			}
			for(let i = 0; i < mergedMesh_arr.length; i++){
				for(let j = 0; j < subtract_array.length; j++){
					if(mergedMesh_arr[i].id == subtract_array[j].id){
						mergedMesh_arr[i].position.x = subtract_array[j].position.x
						mergedMesh_arr[i].position.y = subtract_array[j].position.y - mergedMesh_arr[i].metadata.height
						mergedMesh_arr[i].position.z = subtract_array[j].position.z
					}
				}
			}
			camera.attachControl(canvas, true);
        	startingPoint = null;
		}

		movingOptions.permission = false;
		movingOptions.isMovingUp = false;
		movingOptions.isMovingDown = false;
		movingOptions.isRotateLeft = false;
		movingOptions.isRotateRight = false;
		
		if(targetMesh){
			for(let i = 0; i < subjectSprite_array.length; i++){
				if(subjectSprite_array[i].compatibility == targetMesh.id){

					subjectSprite_array[i].position.y = targetMesh.position.y + subjectSprite_array[i].positionProperty.y //targetMesh.sizeProperty.height / 2

				}
			}
		}
	}

	scene.onPointerMove = function () {

		if (!startingPoint) {
            return;
        }
        var current = getGroundPosition();
        if (!current) {
            return;
        }
		if(!currentMesh || currentMesh.immovablePermission == undefined){
			return;
		}

        var diff = current.subtract(startingPoint);
        currentMesh.position.addInPlace(diff);

        startingPoint = current;

		for(let i = 0; i < model_array.length; i++){
			if(model_array[i].id == currentMesh.id){
				model_array[i].position = currentMesh.position
			}
		}

	}

	scene.onBeforeRenderObservable.add(() => {
		if (movingOptions.permission == true) {
			if (movingOptions.isMovingUp == true) {
				speedUp += acceleration;
				if (speedUp > maxSpeed) speedUp = maxSpeed; // Ограничиваем скорость
				targetMesh.position.y += speedUp;
			} else {
				speedUp = 0;
			}
	
			if (movingOptions.isMovingDown == true) {
				speedDown += acceleration;
				if (speedDown > maxSpeed) speedDown = maxSpeed; // Ограничиваем скорость
				targetMesh.position.y -= speedDown;
			} else {
				speedDown = 0;
			}
	
			if (movingOptions.isRotateLeft == true) {
				speedLeft += acceleration;
				if (speedLeft > maxSpeed) speedLeft = maxSpeed; // Ограничиваем скорость
				targetMesh.rotation.y += speedLeft;
			} else {
				speedLeft = 0;
			}
	
			if (movingOptions.isRotateRight == true) {
				speedRight += acceleration;
				if (speedRight > maxSpeed) speedRight = maxSpeed; // Ограничиваем скорость
				targetMesh.rotation.y -= speedRight;
			} else {
				speedRight = 0;
			}
	
			// Update targetModel to match targetMesh
			targetModel.position.y = targetMesh.position.y;
			targetModel.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(targetMesh.rotation);
		} else {
			speedUp = 0;
			speedDown = 0;
			speedLeft = 0;
			speedRight = 0;
		}
	});
	
	planeActionManager = new BABYLON.ActionManager(scene);
	plane.actionManager = planeActionManager;
	planeActionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, function (evt) {

		// Получаем координаты нажатия
		pickInfo = scene.pick(scene.pointerX, scene.pointerY);
		pickInfo.pickedPoint.y = 0;
		position = pickInfo.pickedPoint;

		if(endingOptions.FloorCreateValidator == true){
			if(floor_click_counter >= 2){
				floor_lines_array_.pop().dispose();
			}
			floor_click_counter += 1;
			if(floor_click_counter == 1){
				testSprite = createSprite("/static/img/sprite-group-1.png", 0.4, 'END FLOOR', 3)
				testSprite.cellIndex = 0;
				testSprite.isVisible = true
				testSprite.isPickable = true
			}
			floor_points_array.push(position)
			floor_points_array_.push(position)
			if(floor_click_counter >= 2){
				createLine(floor_points_array_[floor_points_array_.length - 2].x, floor_points_array_[floor_points_array_.length - 2].z, floor_points_array_[floor_points_array_.length - 1].x, floor_points_array_[floor_points_array_.length - 1].z, 'dispose After')
				createLine(floor_points_array_[0].x, floor_points_array_[0].z, floor_points_array_[floor_points_array_.length - 1].x, floor_points_array_[floor_points_array_.length - 1].z, 'dispose After')
			}
			testSprite.position = position
		}

		if(endingOptions.WallCreateValidator == true){
			wall_click_counter += 1; // увеличиваем количество общих кликов локальной конструкции на 1
			wall_points_counter += 1; // увеличиваем количество кликов локальной конструкции на 1

			check_markPosition = pickInfo.pickedPoint

			//отделил createSprite по той причине, что создание спрайта ендинга должно быть до создания базового спрайта стены, иначе базовый спрайт будет поверх ендинга
			if(wall_points_counter == 2){
				check_mark = createSprite("/static/img/check_mark.png", 0.4, 'ENDING', 2);
			}

			endingOptions.PointValidator = 'MAIN';
			createPoint(position, redMaterial)

			if(wall_points_counter == 2){
				creating(0, 1); 
			}

			if(wall_points_counter >= 3){
				creating(1, 2);
			}

			if(check_mark && check_mark.position){
				check_mark.position = check_markPosition
			}
		}
	}));

	function creating(val1, val2){
		if(wall_points_counter >=4){
			endPoints = []; // обнуление самых дальних точек линий(EndPoints)
			wall_points_array_.shift(); // удаление из массива первой точки, чтобы соблюдать технологию, при которой идёт смещение: 1 - 2 - 3; 1 - 2 - 3 - 4; (удаление первого) 2 - 3 - 4;
			wall_lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
			wall_lines_array_.shift();
			WallMesh_array_.shift();
			SideWallMesh_array_.shift();
			SideWallMesh_array_.shift();
		}

		if(wall_points_counter >=3){
			LinePointsO_arr = []; // обнуление точек перпендикуляров
			LinePointsT_arr = []; // обнуление точек перпендикуляров
			WallMesh_array_[0].dispose();
			WallMesh_array_.shift();
			SideWallMesh_array_[0].dispose();
			SideWallMesh_array_[1].dispose();
			SideWallMesh_array_.shift();
			SideWallMesh_array_.shift();
		}

		endingOptions.PointValidator = 'SIDE';
	
		calculateNormal(wall_points_array_[val1].position, wall_points_array_[val2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив для построения линии
	
		calculateNormal(wall_points_array_[val2].position, wall_points_array_[val1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив для построения линии
	
		findMiddlePoint(wall_points_array_[val1], wall_points_array_[val2]) 
		// находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны, но уже для центральной точки, между двумя основными
		calculateNormal(middleVector, wall_points_array_[val2].position)
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		middlePointO = position // серединная точка lines_array_[0]
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
		middlePointT = position // серединная точка lines_array_[1]
	
		calculateNormal(wall_points_array_[val1].position, wall_points_array_[val2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posOx и posOz
		LinePointsT_arr.push(position) // пуш в массив первой точки lines_array_[1]
	
		calculateNormal(wall_points_array_[val2].position, wall_points_array_[val1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsT_arr.push(position) // пуш в массив первой точки lines_array_[1]
	
		createLine(LinePointsO_arr[0].x, LinePointsO_arr[0].z, LinePointsO_arr[1].x, LinePointsO_arr[1].z, 'dispose Now') // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
		createLine(LinePointsT_arr[0].x, LinePointsT_arr[0].z, LinePointsT_arr[1].x, LinePointsT_arr[1].z, 'dispose Now') // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr

		if(wall_points_counter == 2){
			setDataLines(0, 1, 0, 1)

			//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
			updatePointsData('start', 0)
			updatePointsData('end', 1)

			createWall(0, 1);

			wall_lines_array_[0].IdentifierWall = WallMesh_array_[0].id
			wall_lines_array_[1].IdentifierWall = WallMesh_array_[0].id

			createSideWall(0)
			createSideWall(1)
		}

		if(wall_points_counter >= 3){
			setDataLines(2, 3, 1, 2)

			// Задаем точку, от которой будем искать самую дальнюю точку
			referencePoint = wall_points_array_[1].position;
			
			// Перебираем все точки и находим самую дальнюю
			FindFarthestPoint();
			
			setIntersection();

			updatePointsData('middle', 1)
			updatePointsData('end', 2)

			updateDataLines(LinePointsO_arr, LinePointsT_arr)

			createWall(0, 1);
			createSideWall(0)
			createSideWall(1)
			if(endingOptions.CompletionValidator != true){
				createWall(2, 3);
				createSideWall(2)
				createSideWall(3)
			}

			updateIdentifierDataLines(0);

			wall_lines_array_[0].IdentifierSideWall = SideWallMesh_array_[0].id
			wall_lines_array_[1].IdentifierSideWall = SideWallMesh_array_[1].id

			wall_lines_array.forEach(function(element) { 
				if (element.id === wall_lines_array_[0].id) { 
					element.IdentifierSideWall = SideWallMesh_array_[0].id
				} 
				if (element.id === wall_lines_array_[1].id) { 
					element.IdentifierSideWall = SideWallMesh_array_[1].id
				} 
			});

			//удаление из массива старых мешей стен, в качестве улучшения работоспособности кода
			if(endingOptions.CompletionValidator != true){
				WallMesh_array.splice((WallMesh_array.length-3), 1);
				SideWallMesh_array.splice((SideWallMesh_array.length-6), 1);
				SideWallMesh_array.splice((SideWallMesh_array.length-5), 1);
			}

			if(endingOptions.CompletionValidator == true){

				intersectedLines = []
				//Функция перебора всех линий, с таким же ValCombination, как и у нажатой точки
				wall_lines_array.forEach(function(element) { 
					element.ValCombination.value.forEach(function(element_) { 
						if(element_.combination == targetValCombination){
							intersectedLines.push(element)
						}
					});
				});
				//Удаляем из массива линии, которые только что были созданы и оставляем все остальные
				intersectedLines_ = removeDuplicates(intersectedLines, wall_lines_array_);

				// Перебираем массив с линиями и ищем пересечения
				intersectedLineId = -1;
				TargetintersectedLine = []

				for (var i = 0; i < intersectedLines_.length; i++) {
					intersectionValidator = intersectedLines_[i].intersectsMesh(wall_lines_array_[i+2], false);
					if (intersectionValidator) {
						TargetLine = 'detect ' + (i+1);
						intersectedLineId = intersectedLines_[i];
						TargetintersectedLine.push(intersectedLines_[i])
						break;
					}
				}

				AnotherIntersectedLine = removeDuplicates(intersectedLines_, TargetintersectedLine);

				removeItemFromArray(AnotherIntersectedLine, intersectedLineId)

				exclusive_array = [];

				//функция удаления старого меша на месте завершающего клика
				WallMesh_array.forEach(item => {
					if ((item.id === intersectedLineId.IdentifierWall) || (item.id === AnotherIntersectedLine[0].IdentifierWall)) {
						item.dispose();
						exclusive_array.push(item)
					}
				});

				WallMesh_array = removeDuplicates(WallMesh_array, exclusive_array);

				exclusive_array = [];
				
				SideWallMesh_array.forEach(item => {
					if ((item.id === intersectedLineId.IdentifierSideWall) || (item.id === AnotherIntersectedLine[0].IdentifierSideWall)) {
						item.dispose();
						exclusive_array.push(item)
					}
				});

				SideWallMesh_array = removeDuplicates(SideWallMesh_array, exclusive_array);
				
				if(TargetLine == 'detect 1'){
					wall_lines_array_.push(intersectedLineId)
					wall_lines_array_.push(AnotherIntersectedLine[0])
				}else if(TargetLine == 'detect 2'){
					wall_lines_array_.push(AnotherIntersectedLine[0])
					wall_lines_array_.push(intersectedLineId)
				}

				endPoints = []; // обнуление самых дальних точек линий(EndPoints)
				wall_lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
				wall_lines_array_.shift();

				// Задаем точку, от которой будем искать самую дальнюю точку
				referencePoint = wall_points_array_[2].position;
				
				// Перебираем все точки и находим самую дальнюю
				FindFarthestPoint();
				
				setIntersection();

				updateDataLines(wall_lines_array_[2].metadata.pointsPos, wall_lines_array_[3].metadata.pointsPos)
				createWall(0, 1);
				createWall(2, 3);

				createSideWall(0)
				createSideWall(1)

				SideWallMesh_array.splice((SideWallMesh_array.length-6), 1);
				SideWallMesh_array.splice((SideWallMesh_array.length-5), 1);

				createSideWall(2)
				createSideWall(3)

				updateIdentifierDataLines(1);

				resetWallSettings();

				{
					target_Elem = SideWallMesh_array.pop(); // Удаляем последний элемент из массива
					target_Index = (valueEndPointConstruction);

					SideWallMesh_array.splice(target_Index, 0, target_Elem);
				}
				{
					target_Elem = SideWallMesh_array.pop(); // Удаляем последний элемент из массива
					target_Index = (valueEndPointConstruction);
					
					SideWallMesh_array.splice(target_Index, 0, target_Elem);
				}

				wall_click_counter -= 1;

				valueEndPointConstruction = SideWallMesh_array.length
			}
		}
	}

	function createPoint(position_, material_){
	
		// Создание sphere в позиции нажатия
		var wallPoint;
		MeshUniqueId = 0;
		if(endingOptions.SphereValidator != 'ENDING'){
			wallPoint = createSprite("/static/img/red_point.png", 0.2, 'BASE', 1)
			wallPoint.position = position_
		}
	
		if(endingOptions.PointValidator == "MAIN" && endingOptions.SphereValidator != 'ENDING'){
			// функция генерации уникального ID сфере
			for (let i = 0; i < characters.length; i++) {
				var randomIndex = Math.floor(Math.random() * characters.length);
				MeshUniqueId += characters.charAt(randomIndex);
			}
	
			wallPoint.id = MeshUniqueId; // присваиваем ID сфере
			wallPoint.ValCombination = { combination: wall_click_counter };
	
			wall_points_array.push(wallPoint) // пуш в массив всех points
			wall_points_array_.push(wallPoint) // пуш в массив последних трёх points для вычисления перпендикуляров и пересечений
		}
	
		if(endingOptions.SphereValidator == 'ENDING'){
			wall_points_array_.push(targetMesh)
			endingOptions.SphereValidator = 'BUILDING'
		}
	}

	function createWall(val1, val2){

		MeshUniqueId = 0;
			
		// Создаем куб
		WallPoints = [
			new BABYLON.Vector3(wall_lines_array_[val1].metadata.pointsPos[0].x, 0, wall_lines_array_[val1].metadata.pointsPos[0].z),
			new BABYLON.Vector3(wall_lines_array_[val2].metadata.pointsPos[0].x, 0, wall_lines_array_[val2].metadata.pointsPos[0].z),
			new BABYLON.Vector3(wall_lines_array_[val1].metadata.pointsPos[0].x, wallHeight, wall_lines_array_[val1].metadata.pointsPos[0].z),
			new BABYLON.Vector3(wall_lines_array_[val2].metadata.pointsPos[0].x, wallHeight, wall_lines_array_[val2].metadata.pointsPos[0].z),

			new BABYLON.Vector3(wall_lines_array_[val1].metadata.pointsPos[1].x, 0, wall_lines_array_[val1].metadata.pointsPos[1].z),
			new BABYLON.Vector3(wall_lines_array_[val2].metadata.pointsPos[1].x, 0, wall_lines_array_[val2].metadata.pointsPos[1].z),
			new BABYLON.Vector3(wall_lines_array_[val1].metadata.pointsPos[1].x, wallHeight, wall_lines_array_[val1].metadata.pointsPos[1].z),
			new BABYLON.Vector3(wall_lines_array_[val2].metadata.pointsPos[1].x, wallHeight, wall_lines_array_[val2].metadata.pointsPos[1].z),
		];
	
		WallVertexData = new BABYLON.VertexData();
		WallVertexData.positions = [];
		WallVertexData.indices = [];
	
		for (var i = 0; i < WallPoints.length; i++) {
			WallVertexData.positions.push(WallPoints[i].x, WallPoints[i].y, WallPoints[i].z);
		}
	
		// задняя сторона
		WallVertexData.indices.push(0, 1, 2, 1, 2, 3);
		// верхняя сторона
		WallVertexData.indices.push(2, 3, 6, 3, 6, 7);
		// передняя сторона
		WallVertexData.indices.push(4, 5, 6, 5, 6, 7);
		// нижняя сторона
		WallVertexData.indices.push(0, 1, 4, 1, 4, 5);
	
		var mesh = new BABYLON.Mesh("cube", scene);
		WallVertexData.applyToMesh(mesh);

		materialMESH = new BABYLON.StandardMaterial("material", scene);
		materialMESH.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
		materialMESH.alpha = 0.9; // Установка прозрачности 70% (1 - 0.7 = 0.3)

		mesh.material = materialMESH;

        // Делаем материал двусторонним
        mesh.material.backFaceCulling = false;

		// функция генерации уникального ID сфере
		for (let i = 0; i < characters.length; i++) {
			var randomIndex = Math.floor(Math.random() * characters.length);
			MeshUniqueId += characters.charAt(randomIndex);
		}

		
		mesh.id = MeshUniqueId; // присваиваем ID сфере

		mesh.actionManager = planeActionManager;
		mesh.immovable = true

		WallMesh_array.push(mesh);
		WallMesh_array_.push(mesh);
	}

	function createSideWall(val1){

		MeshUniqueId = 0;

		// Создаем две точки
		pointStart = new BABYLON.Vector3(wall_lines_array_[val1].metadata.pointsPos[0].x, 0, wall_lines_array_[val1].metadata.pointsPos[0].z);
		pointEnd = new BABYLON.Vector3(wall_lines_array_[val1].metadata.pointsPos[1].x, 0, wall_lines_array_[val1].metadata.pointsPos[1].z);

		// Вычисляем разницу между точками
		diffVector = pointEnd.subtract(pointStart);

		// Вычисляем длину вектора разницы (это и будет расстояние между точками)
		distance = diffVector.length();

		var SideWall = BABYLON.MeshBuilder.CreateBox("box", {width: distance, height: wallHeight, depth: 0.0005}, scene);

		position = new BABYLON.Vector3(wall_lines_array_[val1].metadata.middlePos.x, wallHeight/2, wall_lines_array_[val1].metadata.middlePos.z);
		SideWall.position = position;

		var clonedWallMaterial = WallDefaultMaterial.clone("clonedWallMaterial");
		SideWall.material = clonedWallMaterial;
		setDefaultTexture(SideWall, 'Wall', 0.4);

		getAngleVectors(pointStart, pointEnd, globalStart, globalEnd);

		if(fullAngle > 180){
			SideWall.rotation.y = angle;
		}else if(fullAngle < 180){
			SideWall.rotation.y = -angle;
		}

		// функция генерации уникального ID сфере
		for (let i = 0; i < characters.length; i++) {
			var randomIndex = Math.floor(Math.random() * characters.length);
			MeshUniqueId += characters.charAt(randomIndex);
		}

		SideWall.id = MeshUniqueId
		SideWall.distance = distance

		SideWall.metadata = { intersected: [] }
		SideWall.immovable = true

		SideWall.depth = wallWidth

		SideWall.setMaterial = 'Wall';

		SideWallMesh_array.push(SideWall)
		SideWallMesh_array_.push(SideWall)

	}

	// обновление размеров спрайтов в зависимости от отношения дистанция камера - спрайт.
	camera.onViewMatrixChangedObservable.add(() => {
		if(check_mark){
			updateSpriteSize(check_mark, 10, 0.2, 0.4); // обновляет зелёный чек окончания стены
		}
		for(let i = 0; i < wall_points_array.length; i++){
			updateSpriteSize(wall_points_array[i], 25, 0.1, 0.2); // обновляет размер спрайтов точек стены
		}
	});



// функция для вычисления перпендикуляра
function calculateNormal(VecO, VecT){
	dx = VecT.x - VecO.x;
	dz = VecT.z - VecO.z;
	len = Math.sqrt(dx*dx+dz*dz)
	udx = dx / len
	udz = dz / len
	nx = - udz
	nz =  udx
	
	posOx = VecO.x + nx * wallWidth
	posOz = VecO.z + nz * wallWidth 

	posTx = VecO.x - nx * wallWidth
	posTz = VecO.z - nz * wallWidth 
}

// функция создания линий posOSx и posOSz - начальные точки, posTSx и posTSz - конечные
function createLine(posOSx, posOSz, posTSx, posTSz, disposeTime){
	pointO = new BABYLON.Vector3(posOSx, 0, posOSz);
	pointT = new BABYLON.Vector3(posTSx, 0, posTSz)
	pointsLI = [
		pointO, 
		pointT, 
	];
	MeshUniqueId = 0;
	line = BABYLON.MeshBuilder.CreateLines("lines", { points: pointsLI });
	// функция генерации уникального ID линиям
	for (let i = 0; i < characters.length; i++) {
		var randomIndex = Math.floor(Math.random() * characters.length);
		MeshUniqueId += characters.charAt(randomIndex);
	}
	line.id = MeshUniqueId;

	if(disposeTime == 'dispose After'){
		floor_lines_array.push(line)
		floor_lines_array_.push(line)
	}

	if(disposeTime == 'dispose Now'){
		wall_lines_array.push(line)
		wall_lines_array_.push(line)
		line.dispose();
	}
}

function findMiddlePoint(PosO, PosT){
	if (!PosO || !PosO.position || !PosO.position.x) {
		center_point_x = (PosO.x + PosT.x) / 2;
		center_point_z = (PosO.z + PosT.z) / 2;
	}else{
		center_point_x = (PosO.position.x + PosT.position.x) / 2;
		center_point_z = (PosO.position.z + PosT.position.z) / 2;
	}

	middleVector = new BABYLON.Vector3(center_point_x, 0, center_point_z)
}

//функция нахождения самой дальней точки от заданной
function FindFarthestPoint(){
	for(var j = 0; j < wall_lines_array_.length; j++){
		distanceSquared = 0;
		farthestPoint = 0;
		farthestDistanceSquared = 0;
		for (var i = 0; i < wall_lines_array_[j].metadata.pointsPos.length; i++) {
			// referencePoint - точка, от которой ищется самая дальняя, lines_array_[j].metadata.pointsPos[i] - перебор массива, находящегося в линии и содержащего в себе крайние точки линии
			distanceSquared = BABYLON.Vector3.DistanceSquared(referencePoint, wall_lines_array_[j].metadata.pointsPos[i]);
			if (distanceSquared > farthestDistanceSquared) {
				farthestDistanceSquared = distanceSquared;
				farthestPoint = wall_lines_array_[j].metadata.pointsPos[i];
			}
		}
		// Если найдена самая удаленная точка
		// farthestPoint - крайняя точка от заданной
		if (farthestPoint) {
			endPoints.push(farthestPoint)
		} else {

		}
	}
}

function calculateIntersection(p1X, p1Z, p2X, p2Z, p3X, p3Z, p4X, p4Z){
	// line 1
	p1I = { x:  p1X, z:  p1Z }; // P1: (x1, y1)
	p2I = { x:  p2X, z:  p2Z}; // P2: (x2, y2)
				
	// line 2
	p3I = { x:  p3X, z:  p3Z }; // P3: (x4, y4)
	p4I = { x:  p4X, z:  p4Z }; // P4: (x4, y4)

	c2x = p3I.x - p4I.x; // (x3 - x4)
	c3x = p1I.x - p2I.x; // (x1 - x2)
	c2z = p3I.z - p4I.z; // (y3 - y4)
	c3z = p1I.z - p2I.z; // (y1 - y2)
	
	// down part of intersection point formula
	d  = c3x * c2z - c3z * c2x;
	
	if (d == 0) {
	  throw new Error('Number of intersection points is zero or infinity.');
	}

	// upper part of intersection point formula
	u1 = p1I.x * p2I.z - p1I.z * p2I.x; // (x1 * y2 - y1 * x2)
	u4 = p3I.x * p4I.z - p3I.z * p4I.x; // (x3 * y4 - y3 * x4)

	// intersection point formula

	px = (u1 * c2x - c3x * u4) / d;
	pz = (u1 * c2z - c3z * u4) / d;

	interP = { x: px, z: pz };
}

function setIntersection(){
	// Usage example:
	calculateIntersection(
		endPoints[0].x, endPoints[0].z, wall_lines_array_[0].metadata.middlePos.x, wall_lines_array_[0].metadata.middlePos.z,
		endPoints[2].x, endPoints[2].z, wall_lines_array_[2].metadata.middlePos.x, wall_lines_array_[2].metadata.middlePos.z,
	)
	position = new BABYLON.Vector3(interP.x, 0, interP.z)
	wall_lines_array_[0].metadata.pointsPos[1] = position
	wall_lines_array_[2].metadata.pointsPos[0] = position

	calculateIntersection(
		endPoints[1].x, endPoints[1].z, wall_lines_array_[1].metadata.middlePos.x, wall_lines_array_[1].metadata.middlePos.z,
		endPoints[3].x, endPoints[3].z, wall_lines_array_[3].metadata.middlePos.x, wall_lines_array_[3].metadata.middlePos.z,
	)
	position = new BABYLON.Vector3(interP.x, 0, interP.z)
	wall_lines_array_[1].metadata.pointsPos[1] = position
	wall_lines_array_[3].metadata.pointsPos[0] = position
}

function updatePointsData(val1, val2){
	//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
	wall_points_array_[val2].BegEnd = val1
	wall_points_array.forEach(function(element) { 
		if (element.id === wall_points_array_[val2].id) { 
			element.PointPositionWC = { attachedPoints: { id: [wall_points_array_[val2].id] } }; 
			element.BegEnd = val1
		} 
	});
}

function setDataLines(val1, val2, val3, val4){
	wall_lines_array_[val1].metadata = { pointsPos: LinePointsO_arr, middlePos: middlePointO } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
	wall_lines_array_[val1].ValCombination = { value: [wall_points_array_[val3].ValCombination, wall_points_array_[val4].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
	wall_lines_array_[val2].metadata = { pointsPos: LinePointsT_arr, middlePos: middlePointT } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
	wall_lines_array_[val2].ValCombination = { value: [wall_points_array_[val3].ValCombination, wall_points_array_[val4].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
}

function updateDataLines(val1, val2){
	wall_lines_array.forEach(function(element) { 
		if (element.id === wall_lines_array_[0].id) { 
			findMiddlePoint(wall_lines_array_[0].metadata.pointsPos[0], wall_lines_array_[0].metadata.pointsPos[1])
			element.metadata.middlePos = middleVector // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
		} 
		if (element.id === wall_lines_array_[1].id) { 
			findMiddlePoint(wall_lines_array_[1].metadata.pointsPos[0], wall_lines_array_[1].metadata.pointsPos[1])
			element.metadata.middlePos = middleVector // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
		} 
		if (element.id === wall_lines_array_[2].id) { 
			findMiddlePoint(wall_lines_array_[2].metadata.pointsPos[0], wall_lines_array_[2].metadata.pointsPos[1])
			element.metadata = { pointsPos: val1, middlePos: middleVector } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
			if(endingOptions.CompletionValidator != true){
				element.ValCombination = { value: [wall_points_array_[1].ValCombination, wall_points_array_[2].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
			}
		} 
		if (element.id === wall_lines_array_[3].id) { 
			findMiddlePoint(wall_lines_array_[3].metadata.pointsPos[0], wall_lines_array_[3].metadata.pointsPos[1])
			element.metadata = { pointsPos: val2, middlePos: middleVector } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
			if(endingOptions.CompletionValidator != true){
				element.ValCombination = { value: [wall_points_array_[1].ValCombination, wall_points_array_[2].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
			}
		} 
	});
}

function updateIdentifierDataLines(val1){
	wall_lines_array_[0].IdentifierWall = WallMesh_array_[val1].id
	wall_lines_array_[1].IdentifierWall = WallMesh_array_[val1].id

	wall_lines_array.forEach(function(element) { 
		if (element.id === wall_lines_array_[0].id) { 
			element.IdentifierWall = WallMesh_array_[val1].id
		} 
		if (element.id === wall_lines_array_[1].id) { 
			element.IdentifierWall = WallMesh_array_[val1].id
		} 
	});
}

function updateSideWallDataLines(val1, val2){
	wall_lines_array_[0].IdentifierSideWall = SideWallMesh_array_[val1].id
	wall_lines_array_[1].IdentifierSideWall = SideWallMesh_array_[val2].id

	wall_lines_array.forEach(function(element) { 
		if (element.id === wall_lines_array_[0].id) { 

		} 
		if (element.id === wall_lines_array_[1].id) { 

		} 
	});
}

function getAngleVectors(val1, val2, val3, val4){
	// Находим вектора для каждого отрезка
	vectorO = val2.subtract(val1);
	vectorT = val4.subtract(val3);

	// Нормализуем вектора
	vectorO = vectorO.normalize();
	vectorT = vectorT.normalize();

	// Вычисляем скалярное произведение нормализованных векторов
	dotProduct = BABYLON.Vector3.Dot(vectorO, vectorT);

	// Находим угол между векторами в радианах
	angle = Math.acos(dotProduct);

	// Находим знак угла с помощью векторного произведения
	crossProduct = BABYLON.Vector3.Cross(vectorO, vectorT);
	sign = BABYLON.Vector3.Dot(BABYLON.Vector3.Up(), crossProduct);

	// Преобразуем результат в градусы и переводим его в необходимый диапазон
	degrees = BABYLON.Tools.ToDegrees(angle);
	fullAngle = sign >= 0 ? degrees : 360 - degrees;

	//console.log("Угол между отрезками в диапазоне от 0 до 360 градусов: " + fullAngle);
}

function createSprite(url, size, property_, renderingPos){
	var spriteManager = new BABYLON.SpriteManager("spriteManager", url, 1, 512.5, scene);

	spriteManager.renderingGroupId = renderingPos;

	var sprite = new BABYLON.Sprite("sprite", spriteManager);
	sprite.size = size;
	sprite.isPickable = true;

	sprite.property = property_;

	spriteManager.isPickable = true;   

	return sprite;
}

// Функция для обновления размера спрайта в зависимости от дистанции
function updateSpriteSize(obj, factor, minVal, maxVal) {
	let distance = BABYLON.Vector3.Distance(obj.position, camera.position);
	let scaleFactor = factor / distance; // Изменение размера спрайта в обратной зависимости от дистанции
	obj.size = 1 - (scaleFactor * maxVal);
	if(obj.size < minVal){
		obj.size = minVal
	}else if(obj.size > maxVal){
		obj.size = maxVal
	}
}

function resetWallSettings(){
	wall_points_counter = 0;
	wall_points_array_ = [];
	wall_lines_array_ = [];
	WallMesh_array_ = [];
	SideWallMesh_array_ = [];
	LinePointsO_arr = []; 
	LinePointsT_arr = []; 
	endPoints = [];

	endingOptions.CompletionValidator = false
	endingOptions.WallCreateValidator = false
}

function createSubtractMesh(){

	for (let i = 0; i < subtract_array.length; i++) {
		foundIntersection = false; // Флаг для отслеживания пересечения
		for (let j = 0; j < SideWallMesh_array.length; j++) {
			trianglePoints = [];
			//foundIntersection = false;
			
			// Проверка пересечения с элементом
			if (SideWallMesh_array[j].intersectsMesh(subtract_array[i], true) && subtract_array[i].meshType == 'windowMesh') {
				foundIntersection = true; // Устанавливаем флаг пересечения
				
				mergedMesh_arr[i].visibility = 1; // Устанавливаем видимость
				subtract_array[i].scaling.z = 1;
				subtract_array[i].scaling.z = (subtract_array[i].scaling.z * ((SideWallMesh_array[j].depth * 2) / mergedMesh_arr[i].depth)) + 0.005;
				mergedMesh_arr[i].scaling.z = subtract_array[i].scaling.z + 0.25;
				subtract_array[i].rotation.y = SideWallMesh_array[j].rotation.y;
				mergedMesh_arr[i].rotation.y = SideWallMesh_array[j].rotation.y;
	
				model_array[i].rotationQuaternion = BABYLON.Quaternion.FromEulerVector(subtract_array[i].rotation);
				trianglePoints.push(wall_points_array[wall_lines_array[j].ValCombination.value[0].combination - 1].position); // начало линии
				trianglePoints.push(wall_points_array[wall_lines_array[j].ValCombination.value[1].combination - 1].position); // окончание линии
				trianglePoints.push(subtract_array[i].position); // позиция куба
				
				diffVector = trianglePoints[1].subtract(trianglePoints[0]);
				distance = diffVector.length();
				dotProduct = BABYLON.Vector3.Dot(trianglePoints[2].subtract(trianglePoints[0]), diffVector) / distance;
				position = trianglePoints[0].add(diffVector.scale(dotProduct / distance));
				subtract_array[i].position.x = position.x;
				subtract_array[i].position.z = position.z;
			}
		}
		// Если пересечения не найдено, устанавливаем visibility = 0
		if (!foundIntersection) {
			mergedMesh_arr[i].visibility = 0;
			subtract_array[i].scaling.z = 1
			mergedMesh_arr[i].scaling.z = 1
		}
	}
	
	setTimeout(
		() => {
			for(let j = 0; j < SideWallMesh_array.length; j++){

				if(SideWallMesh_array[j] && SideWallMesh_array[j].changed && SideWallMesh_array[j].changed == true){

					SideWallMesh_array[j].dispose();
					var SideWall = BABYLON.MeshBuilder.CreateBox("box", {width: SideWallMesh_array[j].distance, height: wallHeight, depth: 0.0005}, scene);
					SideWall.rotation = SideWallMesh_array[j].rotation
					SideWall.position = SideWallMesh_array[j].position
					SideWall.distance = SideWallMesh_array[j].distance
					SideWall.material = SideWallMesh_array[j].material
					SideWall.id = SideWallMesh_array[j].id
					SideWall.metadata = SideWallMesh_array[j].metadata
					SideWall.immovable = SideWallMesh_array[j].immovable
					SideWall.depth = SideWallMesh_array[j].depth
					SideWallMesh_array[j] = SideWall

				}

				if (SideWallMesh_array[j].metadata !== null && typeof SideWallMesh_array[j].metadata === 'object' && SideWallMesh_array[j].metadata.intersected !== undefined) {

				}else{
					SideWallMesh_array[j].metadata = { intersected: [] }
				}

				SideWallMesh_array[j].metadata.intersected = [];

				SideWallMesh_array[j].resultCSG = BABYLON.CSG.FromMesh(SideWallMesh_array[j]);

				for(let i = 0; i < subtract_array.length; i++){

					if(subtract_array[i].meshType == 'windowMesh'){
						if (SideWallMesh_array[j].intersectsMesh(subtract_array[i], true)) {
							SideWallMesh_array[j].metadata.intersected.push(subtract_array[i])

						}

						var meshCSG = BABYLON.CSG.FromMesh(subtract_array[i]);
						SideWallMesh_array[j].resultCSG = SideWallMesh_array[j].resultCSG.subtract(meshCSG);
					}

				}

				if(SideWallMesh_array[j].metadata.intersected != 0){
					var resultMesh = SideWallMesh_array[j].resultCSG.toMesh("resultMesh", scene);

					SideWallMesh_array[j].dispose();
					resultMesh.distance = SideWallMesh_array[j].distance
					resultMesh.id = SideWallMesh_array[j].id
					resultMesh.metadata = SideWallMesh_array[j].metadata
					resultMesh.immovable = SideWallMesh_array[j].immovable
					resultMesh.depth = SideWallMesh_array[j].depth
					resultMesh.material = SideWallMesh_array[j].material
					SideWallMesh_array[j] = resultMesh
					SideWallMesh_array[j].changed = true
				}else{
					SideWallMesh_array[j].changed = true
				}

			}
		},
		1 * 100
	);
}

function createSubjectSprite(arr_, positionProperty_, pivotSettings_, compatibility_, sprite_){
	var box = BABYLON.MeshBuilder.CreateBox("box", {width: 0.001, height: 0.001, depth: 0.001}, scene, true);
	box.compatibility = compatibility_;
	box.positionProperty = positionProperty_
	box.position.x = arr_.position.x + box.positionProperty.x
	box.position.y = arr_.position.y + box.positionProperty.y
	box.position.z = arr_.position.z + box.positionProperty.z
	box.setPivotPoint(pivotSettings_);
	sprite_.position = box.getAbsolutePosition()
	return box;
}

//функция получения позиции при нажатии по plane, либо ведения по плоскости меша
var getGroundPosition = function () {
	pickInfo = scene.pick(scene.pointerX, scene.pointerY, function (mesh) { return mesh == plane; });
	if (pickInfo.hit) {
		return pickInfo.pickedPoint;
	}

	return null;
}

const zoomInButton = document.getElementById('zoomIn');
const zoomOutButton = document.getElementById('zoomOut');
const zoomRange = document.getElementById('zoomRange');

// Функция для обновления масштаба
function updateZoom(value) {
    // Обратите значение для инверсии
    scene.activeCamera.radius = 10 - value; // где 10 - начальное значение масштаба
}

// Слушатели событий для кнопок
zoomInButton.addEventListener('click', function() {
    const currentValue = parseFloat(zoomRange.value);
    const newValue = Math.max(0, currentValue + 0.1);
    zoomRange.value = newValue;
    updateZoom(newValue);
});

zoomOutButton.addEventListener('click', function() {
    const currentValue = parseFloat(zoomRange.value);
    const newValue = Math.min(10, currentValue - 0.1);
    zoomRange.value = newValue;
    updateZoom(newValue);
});

// Ползунок
zoomRange.addEventListener('input', function() {
    updateZoom(parseFloat(zoomRange.value));
});

// Обработчик событий для прокрутки колёсика мыши
window.addEventListener('wheel', function(event) {
    const invertedZoomValue = 10 - scene.activeCamera.radius;
    zoomRange.value = invertedZoomValue;
});

document.getElementById('ChageTo3D').addEventListener('click', function() {
	const newValue = 2
    zoomRange.value = newValue;
    updateZoom(newValue);
});

document.getElementById('ChageTo2D').addEventListener('click', function() {
	const newValue = 8
    zoomRange.value = newValue;
    updateZoom(newValue);
});

function createSideWallModel(targetModel_, width_, height_, depth_, Xvalue_, Yvalue_, token_){
	var SideModel = BABYLON.MeshBuilder.CreateBox("box", {width: width_, height: height_, depth: depth_}, scene);
	if(token_ == 'plus'){
		SideModel.position.x = targetModel_.position.x + Xvalue_
		SideModel.position.y = targetModel_.position.y + Yvalue_
	}
	if(token_ == 'minus'){
		SideModel.position.x = targetModel_.position.x - Xvalue_
		SideModel.position.y = targetModel_.position.y - Yvalue_
	}
	SideModel.rotation.y = Math.PI / 2;
	sideModal_arr_.push(SideModel)
	return SideModel
}

function setDefaultTexture(mesh_, token_, value_) {
	var TextureWidth;
	var TextureHeight;
	if(token_ == 'Floor'){
		//Получаем вершины полигона
		var positions = mesh_.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    
		// Определяем максимальные и минимальные координаты для X и Y
		var minX = Math.min(...positions.filter((_, index) => index % 3 === 0));
		var maxX = Math.max(...positions.filter((_, index) => index % 3 === 0));
		var minY = Math.min(...positions.filter((_, index) => index % 3 === 2));
		var maxY = Math.max(...positions.filter((_, index) => index % 3 === 2));
		
		// Расчитываем размеры
		TextureWidth = maxX - minX;
		TextureHeight = maxY - minY;
	}else if(token_ == 'Wall'){
		// Получаем размеры меша
		boundingInfo = mesh_.getBoundingInfo();
		dimensions = boundingInfo.boundingBox.maximum.subtract(boundingInfo.boundingBox.minimum);

		TextureWidth = dimensions.x
		TextureHeight = dimensions.y
	}

	mesh_.material.diffuseTexture.wrapU = BABYLON.Texture.WRAP_ADDRESS_MODE;
	mesh_.material.diffuseTexture.wrapV = BABYLON.Texture.WRAP_ADDRESS_MODE;

	// Устанавливаем uScale и vScale на основании размеров полигона и коэффициентов
	mesh_.material.diffuseTexture.uScale = TextureHeight * value_; // ширина с учетом коэффициента повторения
	mesh_.material.diffuseTexture.vScale = TextureHeight * value_; // высота с учетом коэффициента повторения

}

//-------------- TEST SEGMENT --------------//

//функция удаления переменных одного массива из другого
function removeDuplicates(arr1, arr2) {
	let result = arr1.filter(item => !arr2.includes(item));
	return result;
}

function removeItemFromArray(arr, item) {
    const index = arr.indexOf(item);
    if (index > -1) {
        arr.splice(index, 1);
    }
}

function generateRandomColor() {
	var red = Math.random();
	var green = Math.random();
	var blue = Math.random();
	
	return new BABYLON.Color3(red, green, blue);
}

window.addEventListener("resize", function() {
	engine.resize();
});
engine.runRenderLoop(function() {
	scene.render();
});