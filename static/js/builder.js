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
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // переменная для генерации рандомного ID состоящего из 16 символов
var SphereUniqueId = ''; // уникальный ID для каждой сферы
var points_counter = 0; // обозначает сколько кликов для создания стен было сделано
var pickInfo, position; // координаты нажатия 
let points_array = []; // массив для позиций точек в формате вектор3
let points_array_ = []; // массив для хранения последних трёх позиций точек в формате вектор3
var posOx, posOz, posTx, posTz; // posOx и posOz - первая точка для выстраивания вектора | posTx и posTz - вторая точка для выстраивания вектора
var dx, dz, len, udx, udz, nx, nz; // значения calculateNormal для выстраивания перпендикуляра
var R = 0.7; // ширина стены
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


//-------------- TEST SEGMENT --------------//
var PointValidator = 'MAIN'
var SphereValidator = 'BUILDING'
var CompletionValidator = false

function builder(scene_, plane_, redMaterial_, blueMaterial_){

	// Создание onPointerDown для всей сцены и если находим точку с BegEnd === 'start', то делаем функцию завершения построения стены
	scene_.onPointerDown = function (event, pickResult) {
		if (pickResult.hit && pickResult.pickedMesh) {
			var mesh = pickResult.pickedMesh;
			if (mesh && mesh.BegEnd === 'start') {
				points_counter += 1;

				// Получаем координаты нажатия
				PointValidator = 'MAIN';
				SphereValidator = 'ENDING'
				CompletionValidator = true
				position = mesh._absolutePosition;
				createSphere(position, redMaterial_)
				
				creating(1, 2);
			}
		}
	};
	
	var planeActionManager = new BABYLON.ActionManager(scene_);
	plane_.actionManager = planeActionManager;
	planeActionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, function (evt) {

		points_counter += 1; //увеличиваем количество кликов на 1

		// Получаем координаты нажатия
		pickInfo = scene_.pick(scene_.pointerX, scene_.pointerY);
		position = pickInfo.pickedPoint;

		PointValidator = 'MAIN';
		createSphere(position, redMaterial_)

		if(points_counter == 2){
			creating(0, 1);
		}

		if(points_counter >= 3){
			creating(1, 2);

			//console.log(points_array)
		}

	}));

	function creating(val1, val2){

		if(points_counter >=4){
			endPoints = []; // обнуление самых дальних точек линий(EndPoints)
			points_array_.shift(); // удаление из массива первой точки, чтобы соблюдать технологию, при которой идёт смещение: 1 - 2 - 3; 1 - 2 - 3 - 4; (удаление первого) 2 - 3 - 4;
			lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
			lines_array_.shift();
		}

		if(points_counter >=3){
			LinePointsO_arr = []; // обнуление точек перпендикуляров
			LinePointsT_arr = []; // обнуление точек перпендикуляров
		}

		PointValidator = 'SIDE';
	
		calculateNormal(points_array_[val1].position, points_array_[val2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив для построения линии
		//createSphere(position, redMaterial_)
	
		calculateNormal(points_array_[val2].position, points_array_[val1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив для построения линии
		//createSphere(position, redMaterial_)
	
		findMiddlePoint(points_array_[val1], points_array_[val2]) 
		// находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны, но уже для центральной точки, между двумя основными
		calculateNormal(middleVector, points_array_[val2].position)
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		middlePointO = position // серединная точка lines_array_[0]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
		middlePointT = position // серединная точка lines_array_[1]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz
	
		calculateNormal(points_array_[val1].position, points_array_[val2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posOx и posOz
		LinePointsT_arr.push(position) // пуш в массив первой точки lines_array_[1]
		//createSphere(position, redMaterial_)
	
		calculateNormal(points_array_[val2].position, points_array_[val1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsT_arr.push(position) // пуш в массив первой точки lines_array_[1]
		//createSphere(position, redMaterial_)
	
		createLine(LinePointsO_arr[0].x, LinePointsO_arr[0].z, LinePointsO_arr[1].x, LinePointsO_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
		createLine(LinePointsT_arr[0].x, LinePointsT_arr[0].z, LinePointsT_arr[1].x, LinePointsT_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr

		if(points_counter == 2){
			setDataLines(0, 1, 0, 1)

			//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
			updatePointsData('start', 0)
			updatePointsData('end', 1)
		}

		if(points_counter >= 3){
			setDataLines(2, 3, 1, 2)

			// Задаем точку, от которой будем искать самую дальнюю точку
			referencePoint = points_array_[1]._absolutePosition;
			
			// Перебираем все точки и находим самую дальнюю
			FindFarthestPoint();
			
			setIntersection();

			updatePointsData('middle', 1)
			updatePointsData('end', 2)

			updateDataLines(LinePointsO_arr, LinePointsT_arr)
			
			if(CompletionValidator == true){
				var test_arr = []
				lines_array.forEach(function(element) { 
					element.ValCombination.value.forEach(function(element_) { 
						if(element_.combination == 1){
							//console.log(element_.combination)
							test_arr.push(element)
						}
					});
				});
				let newArray = removeDuplicates(test_arr, lines_array_);


				// Перебираем массив с линиями и ищем пересечения
				var intersectedLineId = -1;
				var intersection;
				var test_arr_ = []
				var testValidator;
				for (var i = 0; i < newArray.length; i++) {
					intersection = newArray[0].intersectsMesh(lines_array_[2], false);
					if (intersection) {
						console.log('detect 1')
						testValidator = 'detect 1'
						intersectedLineId = newArray[0];
						test_arr_.push(newArray[0])
						break;
					}
					intersection = newArray[1].intersectsMesh(lines_array_[3], false);
					if (intersection) {
						console.log('detect 4')
						testValidator = 'detect 4'
						intersectedLineId = newArray[1];
						test_arr_.push(newArray[1])
						break;
					}
				}
				let newArray_ = removeDuplicates(newArray, test_arr_);

				// Выводим ID пересекающейся линии
				if (intersectedLineId !== -1) {
					console.log("Первая пересекающаяся линия найдена. ID: " + intersectedLineId.id);
				} else {
					console.log("Линия не найдена");
				}

				removeItemFromArray(newArray_, intersectedLineId)

				if(testValidator == 'detect 1'){
					lines_array_.push(intersectedLineId)
					lines_array_.push(newArray_[0])
				}else if(testValidator == 'detect 4'){
					lines_array_.push(newArray_[0])
					lines_array_.push(intersectedLineId)
				}

				endPoints = []; // обнуление самых дальних точек линий(EndPoints)
				lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
				lines_array_.shift();

				// Задаем точку, от которой будем искать самую дальнюю точку
				referencePoint = points_array_[2]._absolutePosition;
				
				// Перебираем все точки и находим самую дальнюю
				FindFarthestPoint();
				
				setIntersection();

				updateDataLines(lines_array_[2].metadata.pointsPos, lines_array_[3].metadata.pointsPos)

				// Создаем куб
				var points = [
					new BABYLON.Vector3(-1, -1, -1),
					new BABYLON.Vector3(1, -1, -1),
					new BABYLON.Vector3(-1, 1, -1),
					new BABYLON.Vector3(1, 1, -1),
					new BABYLON.Vector3(-1, -1, 1),
					new BABYLON.Vector3(1, -1, 1),
					new BABYLON.Vector3(-1, 1, 1),
					new BABYLON.Vector3(1, 1, 1)
				];

				var vertexData = new BABYLON.VertexData();
				vertexData.positions = [];
				vertexData.indices = [];

				for (var i = 0; i < points.length; i++) {
					vertexData.positions.push(points[i].x, points[i].y, points[i].z);
				}

				// Оставляем только верхнюю и нижнюю стороны куба
				vertexData.indices.push(0, 1, 2, 1, 3, 2); // Нижняя сторона
				vertexData.indices.push(4, 6, 5, 5, 6, 7); // Верхняя сторона

				vertexData.applyToMesh(createCube("cube", scene_));

				function createCube(name, scene_) {
					var cube = new BABYLON.Mesh(name, scene_);
					return cube;
				}
			}
		}
	}
	
	

}

function createSphere(position_, material_){
	
	// Создание sphere в позиции нажатия
	var sphere;
	if(SphereValidator != 'ENDING'){
		sphere = BABYLON.MeshBuilder.CreateSphere("sphere", { segments: 32, diameter: 0.10 }, scene); //scene is 
		sphere.material = material_ // присваиваем материал сфере
		sphere.position = position_; // присваиваем позицию сфере
	}

	if(PointValidator == "MAIN" && SphereValidator != 'ENDING'){
		// функция генерации уникального ID сфере
		for (let i = 0; i < characters.length; i++) {
			var randomIndex = Math.floor(Math.random() * characters.length);
			SphereUniqueId += characters.charAt(randomIndex);
		}

		sphere.id = SphereUniqueId; // присваиваем ID сфере
		sphere.ValCombination = { combination: points_counter };

		points_array.push(sphere) // пуш в массив всех points
		points_array_.push(sphere) // пуш в массив последних трёх points для вычисления перпендикуляров и пересечений
	}

	if(SphereValidator == 'ENDING'){
		points_array_.push(points_array[0])
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
	line = BABYLON.MeshBuilder.CreateLines("lines", { points: pointsLI });
	// функция генерации уникального ID линиям
	for (let i = 0; i < characters.length; i++) {
		var randomIndex = Math.floor(Math.random() * characters.length);
		SphereUniqueId += characters.charAt(randomIndex);
	}
	line.id = SphereUniqueId;
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
	//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению interP.x и interP.z

	calculateIntersection(
		endPoints[1].x, endPoints[1].z, lines_array_[1].metadata.middlePos.x, lines_array_[1].metadata.middlePos.z,
		endPoints[3].x, endPoints[3].z, lines_array_[3].metadata.middlePos.x, lines_array_[3].metadata.middlePos.z,
	)
	position = new BABYLON.Vector3(interP.x, 0, interP.z)
	lines_array_[1].metadata.pointsPos[1] = position
	lines_array_[3].metadata.pointsPos[0] = position
	//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению interP.x и interP.z
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

var scene = createScene();
engine.runRenderLoop(function() {
	scene.render();
});
window.addEventListener("resize", function() {
	engine.resize();
});