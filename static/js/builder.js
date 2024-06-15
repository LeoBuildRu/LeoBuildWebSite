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
	var doubleFaceMaterial = new BABYLON.StandardMaterial("material", scene);

	//импорт настроек материалов из MaterialSettings.js
	const MaterialArguments = ExportMaterialSettings(scene, redMaterial, blueMaterial, doubleFaceMaterial); 

	// присвоение материалу его импортного значения
	redMaterial = MaterialArguments.redMaterial 
	blueMaterial = MaterialArguments.blueMaterial 
	doubleFaceMaterial = MaterialArguments.doubleFaceMaterial 

	builder(canvas, scene, camera, plane, redMaterial, blueMaterial, doubleFaceMaterial)

  	return scene;
};

//-------------- ОБЪЯВЛЕНИЕ ПЕРЕМЕННЫХ --------------//
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // переменная для генерации рандомного ID состоящего из 16 символов
var MeshUniqueId = ''; // уникальный ID для каждой сферы
var click_counter = 0; // обозначает сколько всего кликов было сделано
var points_counter = 0; // обозначает сколько кликов для создания стен было сделано
var pickInfo, position; // координаты нажатия 
let points_array = []; // массив для позиций точек в формате вектор3
let points_array_ = []; // массив для хранения последних трёх позиций точек в формате вектор3
var posOx, posOz, posTx, posTz; // posOx и posOz - первая точка для выстраивания вектора | posTx и posTz - вторая точка для выстраивания вектора
var dx, dz, len, udx, udz, nx, nz; // значения calculateNormal для выстраивания перпендикуляра
var R = 0.4; // ширина стены
var pointO, pointT // точки для построения линии
var line; // линия, для нахождения пересечений
var pointsLI; // массив для заточения в него точек для последующего создания линии
let LinePointsO_arr = [], LinePointsT_arr = [];
let lines_array = []; // массив для позиций всех линий в формате uniqIDline { f: s: t: }
let lines_array_ = []; // массив для хранения последних четырёх линий в формате uniqIDline { f: s: t: }
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
var sprite;
var spritePosition;



//-------------- TEST SEGMENT --------------//
var WallCreateValidator = false
var PointValidator = 'MAIN'
var SphereValidator = 'BUILDING'
var CompletionValidator = false
var materialMESH;
let test_arr = [];
document.getElementById('CreateWall').addEventListener('click', (e)=> {
	WallCreateValidator = true
});

function builder(canvas_, scene_, camera_, plane_, redMaterial_, blueMaterial_, doubleFaceMaterial_){

	// Создание onPointerDown для всей сцены и если находим точку с BegEnd === 'start', то делаем функцию завершения построения стены
	scene_.onPointerDown = function (event, pickResult, pickResult_) {

		pickResult = scene.pickSprite(this.pointerX, this.pointerY); // переводим pickResult в разряд чека спрайтов сцены

		// проверяем, если спрайт действительно есть - запускаем процесс ресета настроек стен и удаления спрайта
		// в противном случае присваиваем к переменной pickResult значение пика по мешу
		if(pickResult && pickResult.pickedSprite && pickResult.pickedSprite.property == 'ENDING'){
			resetWallSettings();

			sprite.dispose()
		}

		if (pickResult && pickResult.pickedSprite && pickResult.pickedSprite.BegEnd === 'start' && WallCreateValidator == true) {
			targetMesh = pickResult.pickedSprite; // присваиваем к переменной targetMesh значение кликнутого меша точки стены
			targetValCombination = pickResult.pickedSprite.ValCombination.combination; // потсваиваем к переменной targetValCombination точки соответствия
			click_counter += 1; // увеличиваем количество общих кликов локальной конструкции на 1
			points_counter += 1; // увеличиваем количество кликов локальной конструкции на 1

			// Получаем координаты нажатия
			PointValidator = 'MAIN';
			SphereValidator = 'ENDING'
			CompletionValidator = true
			position = pickResult.pickedSprite.position;
			createPoint(position, redMaterial_)
			
			creating(1, 2);

			sprite.dispose()
		}
		pickResult = 0;
	};
	
	var planeActionManager = new BABYLON.ActionManager(scene_);
	plane_.actionManager = planeActionManager;
	planeActionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, function (evt) {
		if(WallCreateValidator == true){
			click_counter += 1; // увеличиваем количество общих кликов локальной конструкции на 1
			points_counter += 1; // увеличиваем количество кликов локальной конструкции на 1

			// Получаем координаты нажатия
			pickInfo = scene_.pick(scene_.pointerX, scene_.pointerY);
			position = pickInfo.pickedPoint;

			spritePosition = pickInfo.pickedPoint

			//отделил createSprite по той причине, что создание спрайта ендинга должно быть до создания базового спрайта стены, иначе базовый спрайт будет поверх ендинга
			if(points_counter == 2){
				createSprite("/static/img/check_mark.png", scene_);
			}

			PointValidator = 'MAIN';
			createPoint(position, redMaterial_)

			if(points_counter == 2){
				creating(0, 1); 
			}

			if(points_counter >= 3){
				creating(1, 2);
			}

			if(sprite && sprite.position){
				sprite.position = spritePosition
			}
		}
	}));

	function creating(val1, val2){
		if(points_counter >=4){
			endPoints = []; // обнуление самых дальних точек линий(EndPoints)
			points_array_.shift(); // удаление из массива первой точки, чтобы соблюдать технологию, при которой идёт смещение: 1 - 2 - 3; 1 - 2 - 3 - 4; (удаление первого) 2 - 3 - 4;
			lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
			lines_array_.shift();
			WallMesh_array_.shift();
			SideWallMesh_array_.shift();
			SideWallMesh_array_.shift();
		}

		if(points_counter >=3){
			LinePointsO_arr = []; // обнуление точек перпендикуляров
			LinePointsT_arr = []; // обнуление точек перпендикуляров
			WallMesh_array_[0].dispose();
			WallMesh_array_.shift();
			SideWallMesh_array_[0].dispose();
			SideWallMesh_array_[1].dispose();
			SideWallMesh_array_.shift();
			SideWallMesh_array_.shift();
		}

		PointValidator = 'SIDE';
	
		calculateNormal(points_array_[val1].position, points_array_[val2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив для построения линии
		//createPoint(position, redMaterial_)
	
		calculateNormal(points_array_[val2].position, points_array_[val1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив для построения линии
		//createPoint(position, redMaterial_)
	
		findMiddlePoint(points_array_[val1], points_array_[val2]) 
		// находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны, но уже для центральной точки, между двумя основными
		calculateNormal(middleVector, points_array_[val2].position)
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		middlePointO = position // серединная точка lines_array_[0]
		//createPoint(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
		middlePointT = position // серединная точка lines_array_[1]
		//createPoint(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz
	
		calculateNormal(points_array_[val1].position, points_array_[val2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posOx и posOz
		LinePointsT_arr.push(position) // пуш в массив первой точки lines_array_[1]
		//createPoint(position, redMaterial_)
	
		calculateNormal(points_array_[val2].position, points_array_[val1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsT_arr.push(position) // пуш в массив первой точки lines_array_[1]
		//createPoint(position, redMaterial_)
	
		createLine(LinePointsO_arr[0].x, LinePointsO_arr[0].z, LinePointsO_arr[1].x, LinePointsO_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
		createLine(LinePointsT_arr[0].x, LinePointsT_arr[0].z, LinePointsT_arr[1].x, LinePointsT_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr

		if(points_counter == 2){
			setDataLines(0, 1, 0, 1)

			//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
			updatePointsData('start', 0)
			updatePointsData('end', 1)

			createWall(0, 1);

			lines_array_[0].IdentifierWall = WallMesh_array_[0].id
			lines_array_[1].IdentifierWall = WallMesh_array_[0].id

			createSideWall(0)
			createSideWall(1)
		}

		if(points_counter >= 3){
			setDataLines(2, 3, 1, 2)

			// Задаем точку, от которой будем искать самую дальнюю точку
			referencePoint = points_array_[1].position;
			
			// Перебираем все точки и находим самую дальнюю
			FindFarthestPoint();
			
			setIntersection();

			updatePointsData('middle', 1)
			updatePointsData('end', 2)

			updateDataLines(LinePointsO_arr, LinePointsT_arr)

			createWall(0, 1);
			createSideWall(0)
			createSideWall(1)
			if(CompletionValidator != true){
				createWall(2, 3);
				createSideWall(2)
				createSideWall(3)
			}

			updateIdentifierDataLines(0);

			lines_array_[0].IdentifierSideWall = SideWallMesh_array_[0].id
			lines_array_[1].IdentifierSideWall = SideWallMesh_array_[1].id

			lines_array.forEach(function(element) { 
				if (element.id === lines_array_[0].id) { 
					element.IdentifierSideWall = SideWallMesh_array_[0].id
				} 
				if (element.id === lines_array_[1].id) { 
					element.IdentifierSideWall = SideWallMesh_array_[1].id
				} 
			});

			//удаление из массива старых мешей стен, в качестве улучшения работоспособности кода
			if(CompletionValidator != true){
				WallMesh_array.splice((WallMesh_array.length-3), 1);
				SideWallMesh_array.splice((SideWallMesh_array.length-6), 1);
				SideWallMesh_array.splice((SideWallMesh_array.length-5), 1);
			}

			if(CompletionValidator == true){

				intersectedLines = []
				//Функция перебора всех линий, с таким же ValCombination, как и у нажатой точки
				lines_array.forEach(function(element) { 
					element.ValCombination.value.forEach(function(element_) { 
						if(element_.combination == targetValCombination){
							intersectedLines.push(element)
						}
					});
				});
				//Удаляем из массива линии, которые только что были созданы и оставляем все остальные
				intersectedLines_ = removeDuplicates(intersectedLines, lines_array_);

				// Перебираем массив с линиями и ищем пересечения
				intersectedLineId = -1;
				TargetintersectedLine = []

				for (var i = 0; i < intersectedLines_.length; i++) {
					intersectionValidator = intersectedLines_[i].intersectsMesh(lines_array_[i+2], false);
					if (intersectionValidator) {
						TargetLine = 'detect ' + (i+1);
						intersectedLineId = intersectedLines_[i];
						TargetintersectedLine.push(intersectedLines_[i])
						break;
					}
				}

				AnotherIntersectedLine = removeDuplicates(intersectedLines_, TargetintersectedLine);

				removeItemFromArray(AnotherIntersectedLine, intersectedLineId)

				test_arr = [];

				//функция удаления старого меша на месте завершающего клика
				WallMesh_array.forEach(item => {
					if ((item.id === intersectedLineId.IdentifierWall) || (item.id === AnotherIntersectedLine[0].IdentifierWall)) {
						item.dispose();
						test_arr.push(item)
					}
				});

				WallMesh_array = removeDuplicates(WallMesh_array, test_arr);

				test_arr = [];
				
				SideWallMesh_array.forEach(item => {
					if ((item.id === intersectedLineId.IdentifierSideWall) || (item.id === AnotherIntersectedLine[0].IdentifierSideWall)) {
						item.dispose();
						test_arr.push(item)
					}
				});

				SideWallMesh_array = removeDuplicates(SideWallMesh_array, test_arr);
				
				if(TargetLine == 'detect 1'){
					lines_array_.push(intersectedLineId)
					lines_array_.push(AnotherIntersectedLine[0])
				}else if(TargetLine == 'detect 2'){
					lines_array_.push(AnotherIntersectedLine[0])
					lines_array_.push(intersectedLineId)
				}

				endPoints = []; // обнуление самых дальних точек линий(EndPoints)
				lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
				lines_array_.shift();

				// Задаем точку, от которой будем искать самую дальнюю точку
				referencePoint = points_array_[2].position;
				
				// Перебираем все точки и находим самую дальнюю
				FindFarthestPoint();
				
				setIntersection();

				updateDataLines(lines_array_[2].metadata.pointsPos, lines_array_[3].metadata.pointsPos)
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
			}
		}
	}

	function createWall(val1, val2){

		MeshUniqueId = 0;
			
		// Создаем куб
		WallPoints = [
			new BABYLON.Vector3(lines_array_[val1].metadata.pointsPos[0].x, 0, lines_array_[val1].metadata.pointsPos[0].z),
			new BABYLON.Vector3(lines_array_[val2].metadata.pointsPos[0].x, 0, lines_array_[val2].metadata.pointsPos[0].z),
			new BABYLON.Vector3(lines_array_[val1].metadata.pointsPos[0].x, 1, lines_array_[val1].metadata.pointsPos[0].z),
			new BABYLON.Vector3(lines_array_[val2].metadata.pointsPos[0].x, 1, lines_array_[val2].metadata.pointsPos[0].z),

			new BABYLON.Vector3(lines_array_[val1].metadata.pointsPos[1].x, 0, lines_array_[val1].metadata.pointsPos[1].z),
			new BABYLON.Vector3(lines_array_[val2].metadata.pointsPos[1].x, 0, lines_array_[val2].metadata.pointsPos[1].z),
			new BABYLON.Vector3(lines_array_[val1].metadata.pointsPos[1].x, 1, lines_array_[val1].metadata.pointsPos[1].z),
			new BABYLON.Vector3(lines_array_[val2].metadata.pointsPos[1].x, 1, lines_array_[val2].metadata.pointsPos[1].z),
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
	
		var mesh = new BABYLON.Mesh("cube", scene_);
		WallVertexData.applyToMesh(mesh);

		materialMESH = new BABYLON.StandardMaterial("material", scene_);
		materialMESH.diffuseColor = generateRandomColor();

		mesh.material = materialMESH;

        // Делаем материал двусторонним
        mesh.material.backFaceCulling = false;

		// функция генерации уникального ID сфере
		for (let i = 0; i < characters.length; i++) {
			var randomIndex = Math.floor(Math.random() * characters.length);
			MeshUniqueId += characters.charAt(randomIndex);
		}

		mesh.id = MeshUniqueId; // присваиваем ID сфере

		WallMesh_array.push(mesh);
		WallMesh_array_.push(mesh);
	}

	function createSideWall(val1){

		MeshUniqueId = 0;

		// Создаем две точки
		pointStart = new BABYLON.Vector3(lines_array_[val1].metadata.pointsPos[0].x, 0, lines_array_[val1].metadata.pointsPos[0].z);
		pointEnd = new BABYLON.Vector3(lines_array_[val1].metadata.pointsPos[1].x, 0, lines_array_[val1].metadata.pointsPos[1].z);

		// Вычисляем разницу между точками
		diffVector = pointEnd.subtract(pointStart);

		// Вычисляем длину вектора разницы (это и будет расстояние между точками)
		distance = diffVector.length();

		var SideWall = BABYLON.MeshBuilder.CreateGround("ground", {width: distance, height: 1}, scene_);

		position = new BABYLON.Vector3(lines_array_[val1].metadata.middlePos.x, 0.5, lines_array_[val1].metadata.middlePos.z);
		SideWall.position = position;
		SideWall.rotation.x = Math.PI/2;

		materialMESH = new BABYLON.StandardMaterial("material", scene_);
		materialMESH.diffuseColor = generateRandomColor();

		SideWall.material = materialMESH;

		// Делаем материал двусторонним
		SideWall.material.backFaceCulling = false;

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

		SideWallMesh_array.push(SideWall)
		SideWallMesh_array_.push(SideWall)

	}

}

function createPoint(position_, material_){
	
	// Создание sphere в позиции нажатия
	var spriteManager_;
	var sprite_;
	MeshUniqueId = 0;
	if(SphereValidator != 'ENDING'){
		spriteManager_ = new BABYLON.SpriteManager("spriteManager", "/static/img/red_point.png", 1, 512.5, scene);
		spriteManager_.renderingGroupId = 1;
		sprite_ = new BABYLON.Sprite("sprite", spriteManager_);
		sprite_.size = 0.2;
		sprite_.isPickable = true;
		sprite_.position = position_
		spriteManager_.isPickable = true;  
		sprite_.property = 'BASE'
	}

	if(PointValidator == "MAIN" && SphereValidator != 'ENDING'){
		// функция генерации уникального ID сфере
		for (let i = 0; i < characters.length; i++) {
			var randomIndex = Math.floor(Math.random() * characters.length);
			MeshUniqueId += characters.charAt(randomIndex);
		}

		sprite_.id = MeshUniqueId; // присваиваем ID сфере
		sprite_.ValCombination = { combination: click_counter };

		points_array.push(sprite_) // пуш в массив всех points
		points_array_.push(sprite_) // пуш в массив последних трёх points для вычисления перпендикуляров и пересечений
	}

	if(SphereValidator == 'ENDING'){
		points_array_.push(targetMesh)
		SphereValidator = 'BUILDING'
	}
}

// функция для вычисления перпендикуляра
function calculateNormal(VecO, VecT){
	dx = VecT.x - VecO.x;
	dz = VecT.z - VecO.z;
	len = Math.sqrt(dx*dx+dz*dz)
	udx = dx / len
	udz = dz / len
	nx = - udz
	nz =  udx
	
	posOx = VecO.x + nx * R
	posOz = VecO.z + nz * R 

	posTx = VecO.x - nx * R
	posTz = VecO.z - nz * R 
}

// функция создания линий posOSx и posOSz - начальные точки, posTSx и posTSz - конечные
function createLine(posOSx, posOSz, posTSx, posTSz){
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
	lines_array.push(line)
	lines_array_.push(line)
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
	for(var j = 0; j < lines_array_.length; j++){
		distanceSquared = 0;
		farthestPoint = 0;
		farthestDistanceSquared = 0;
		for (var i = 0; i < lines_array_[j].metadata.pointsPos.length; i++) {
			// referencePoint - точка, от которой ищется самая дальняя, lines_array_[j].metadata.pointsPos[i] - перебор массива, находящегося в линии и содержащего в себе крайние точки линии
			distanceSquared = BABYLON.Vector3.DistanceSquared(referencePoint, lines_array_[j].metadata.pointsPos[i]);
			if (distanceSquared > farthestDistanceSquared) {
				farthestDistanceSquared = distanceSquared;
				farthestPoint = lines_array_[j].metadata.pointsPos[i];
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
		endPoints[0].x, endPoints[0].z, lines_array_[0].metadata.middlePos.x, lines_array_[0].metadata.middlePos.z,
		endPoints[2].x, endPoints[2].z, lines_array_[2].metadata.middlePos.x, lines_array_[2].metadata.middlePos.z,
	)
	position = new BABYLON.Vector3(interP.x, 0, interP.z)
	lines_array_[0].metadata.pointsPos[1] = position
	lines_array_[2].metadata.pointsPos[0] = position
	//createPoint(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению interP.x и interP.z

	calculateIntersection(
		endPoints[1].x, endPoints[1].z, lines_array_[1].metadata.middlePos.x, lines_array_[1].metadata.middlePos.z,
		endPoints[3].x, endPoints[3].z, lines_array_[3].metadata.middlePos.x, lines_array_[3].metadata.middlePos.z,
	)
	position = new BABYLON.Vector3(interP.x, 0, interP.z)
	lines_array_[1].metadata.pointsPos[1] = position
	lines_array_[3].metadata.pointsPos[0] = position
	//createPoint(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению interP.x и interP.z
}

function updatePointsData(val1, val2){
	//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
	points_array_[val2].BegEnd = val1
	points_array.forEach(function(element) { 
		if (element.id === points_array_[val2].id) { 
			element.PointPositionWC = { attachedPoints: { id: [points_array_[val2].id] } }; 
			element.BegEnd = val1
		} 
	});
}

function setDataLines(val1, val2, val3, val4){
	lines_array_[val1].metadata = { pointsPos: LinePointsO_arr, middlePos: middlePointO } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
	lines_array_[val1].ValCombination = { value: [points_array_[val3].ValCombination, points_array_[val4].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
	lines_array_[val2].metadata = { pointsPos: LinePointsT_arr, middlePos: middlePointT } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
	lines_array_[val2].ValCombination = { value: [points_array_[val3].ValCombination, points_array_[val4].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
}

function updateDataLines(val1, val2){
	lines_array.forEach(function(element) { 
		if (element.id === lines_array_[0].id) { 
			findMiddlePoint(lines_array_[0].metadata.pointsPos[0], lines_array_[0].metadata.pointsPos[1])
			element.metadata.middlePos = middleVector // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
		} 
		if (element.id === lines_array_[1].id) { 
			findMiddlePoint(lines_array_[1].metadata.pointsPos[0], lines_array_[1].metadata.pointsPos[1])
			element.metadata.middlePos = middleVector // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
		} 
		if (element.id === lines_array_[2].id) { 
			findMiddlePoint(lines_array_[2].metadata.pointsPos[0], lines_array_[2].metadata.pointsPos[1])
			element.metadata = { pointsPos: val1, middlePos: middleVector } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
			if(CompletionValidator != true){
				element.ValCombination = { value: [points_array_[1].ValCombination, points_array_[2].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
			}
		} 
		if (element.id === lines_array_[3].id) { 
			findMiddlePoint(lines_array_[3].metadata.pointsPos[0], lines_array_[3].metadata.pointsPos[1])
			element.metadata = { pointsPos: val2, middlePos: middleVector } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
			if(CompletionValidator != true){
				element.ValCombination = { value: [points_array_[1].ValCombination, points_array_[2].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
			}
		} 
	});
}

function updateIdentifierDataLines(val1){
	lines_array_[0].IdentifierWall = WallMesh_array_[val1].id
	lines_array_[1].IdentifierWall = WallMesh_array_[val1].id

	lines_array.forEach(function(element) { 
		if (element.id === lines_array_[0].id) { 
			element.IdentifierWall = WallMesh_array_[val1].id
		} 
		if (element.id === lines_array_[1].id) { 
			element.IdentifierWall = WallMesh_array_[val1].id
		} 
	});
}

function updateSideWallDataLines(val1, val2){
	lines_array_[0].IdentifierSideWall = SideWallMesh_array_[val1].id
	lines_array_[1].IdentifierSideWall = SideWallMesh_array_[val2].id

	lines_array.forEach(function(element) { 
		if (element.id === lines_array_[0].id) { 

		} 
		if (element.id === lines_array_[1].id) { 

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

function createSprite(url, scene_){
	var spriteManager = new BABYLON.SpriteManager("spriteManager", url, 1, 512.5, scene_);

	spriteManager.renderingGroupId = 2;

	sprite = new BABYLON.Sprite("sprite", spriteManager);
	sprite.position.x = 0;
	sprite.position.y = 0;
	sprite.size = 0.4;
	sprite.isPickable = true;

	sprite.property = 'ENDING'

	spriteManager.isPickable = true;   
}

function resetWallSettings(){
	points_counter = 0;
	points_array_ = [];
	lines_array_ = [];
	WallMesh_array_ = [];
	SideWallMesh_array_ = [];
	LinePointsO_arr = []; 
	LinePointsT_arr = []; 
	endPoints = [];

	CompletionValidator = false
	WallCreateValidator = false
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
    return arr;
}

function generateRandomColor() {
	var red = Math.random();
	var green = Math.random();
	var blue = Math.random();
	
	return new BABYLON.Color3(red, green, blue);
}

var scene = createScene();
engine.runRenderLoop(function() {
	scene.render();
});
window.addEventListener("resize", function() {
	engine.resize();
});