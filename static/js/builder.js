import { ExportSceneSettings } from './modules/SceneSettings.js';
import { ExportMaterialSettings } from './modules/MaterialSettings.js';

var canvas = document.getElementById("renderCanvas");
var engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
engine.enableAntialiasing = true; // применяем сглаживание для сцены
engine.samples = 100; // устанавливаем сглаживание на 100

// объявление глобальных переменных
var points_counter = 0; // обозначает сколько кликов для создания стен было сделано
let points_array = []; // массив для позиций точек в формате вектор3
let points_array_ = []; // массив для хранения последних трёх позиций точек в формате вектор3
let lines_array = []; // массив для позиций всех линий в формате uniqIDline { f: s: t: }
let lines_array_ = []; // массив для хранения последних четырёх линий в формате uniqIDline { f: s: t: }
var ValueValidatorSphere; // валидатор сферы перед добавлением её в массив клика(не перпендикуляра)
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // переменная для генерации рандомного ID состоящего из 16 символов
var SphereUniqueId = ''; // уникальный ID для каждой сферы
var ValidatorComplited = false;

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

	createWalls(scene, plane, redMaterial, blueMaterial)

  	return scene;
};

function createWalls(scene_, plane_, redMaterial_, blueMaterial_){

	// объявление переменных для функции регистрации клика(все эти значения работаю только внутри функции)
	var R = 1; // ширина стены
	var pickInfo, position; // координаты нажатия 
	var posOx, posOz, posTx, posTz; // posOx и posOz - первая точка для выстраивания вектора | posTx и posTz - вторая точка для выстраивания вектора
	var dx, dz, len, udx, udz, nx, nz; // значения calculateNormal для выстраивания перпендикуляра
	var center_point_x, center_point_z, middleVector; // центральная точка между двумя points - служит для построения центрального перпендикуляра(построение вектора пересечения)
	var pointO, pointT // точки для построения линии
	var line; // линия, для нахождения пересечений
	var pointsLI; // массив для заточения в него точек для последующего создания линии
	let LinePointsO_arr = [], LinePointsT_arr = [];
	var middlePointO, middlePointT;
	// Инициализируем переменные для хранения информации о самой дальней точке
	var farthestPoint, farthestDistanceSquared, referencePoint, distanceSquared // объявление переменных для функции нахождения точек линии для создания пересечений
	let endPoints = []; // массив точек для создания пересечений
	var c2x, c3x, c2z, c3z, d, u1, u4, px, pz, p, p1I, p2I, p3I, p4I; // переменные функции нахождения персечений
	var interP; // точка пересечения
	

	// Создание onPointerDown для всей сцены и если находим точку с BegEnd === 'start', то делаем функцию завершения построения стены
	scene_.onPointerDown = function (event, pickResult) {
		if (pickResult.hit && pickResult.pickedMesh) {
			var mesh = pickResult.pickedMesh;
			if (mesh && mesh.BegEnd === 'start') {
				//console.log(mesh)
				
				for(let i = 0; i<lines_array.length; i++){
					for(let j = 0; j < lines_array[i].ValCombination.value.length; j++){
						if(lines_array[i].ValCombination.value[j].combination == 1){
							//console.log(lines_array[i])
						}
					}
				}
				ValidatorComplited = true
				
				points_counter += 1;

				// Получаем координаты нажатия
				position = mesh._absolutePosition;

				// создаём красную сферу в точке нажатия
				ValueValidatorSphere = 'Main'
				createSphere(position, redMaterial_)
				
				creating();
				
				//console.log(points_array)
				//console.log(lines_array)
			}
		}
	};

	// Создание actionManager для plane
	var planeActionManager = new BABYLON.ActionManager(scene_);
	plane_.actionManager = planeActionManager;
	planeActionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger, function (evt) {

		points_counter += 1;
		console.log(points_counter)

		// Получаем координаты нажатия
		pickInfo = scene_.pick(scene_.pointerX, scene_.pointerY);
		position = pickInfo.pickedPoint;

		// создаём красную сферу в точке нажатия
		ValueValidatorSphere = 'Main'
		createSphere(position, redMaterial_)

		if(points_counter == 2){
			ValueValidatorSphere = 'Side' // обозначаем, что далее идут points со значением side, которые не добавляются в массивы points_array и points_array_

			calculateNormal(points_array_[0].position, points_array_[1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
			position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
			LinePointsO_arr.push(position) // пуш в массив первой точки lines_array_[0]
			//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
			position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
			LinePointsT_arr.push(position) // пуш в массив последней точки lines_array_[1]
			//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz
			// присваиваем перпендикуляры к точке в качестве аттрибутов
			points_array_[0].PointPositionWC = { attachedPoints: { id: [points_array_[0].id], xO: posOx, zO: posOz, xT: posTx, zT: posTz } };
			points_array_[0].BegEnd = 'start'
			//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[0] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
			points_array.forEach(function(element) { 
				if (element.id === points_array_[0].id) { 
				 	element.PointPositionWC = { attachedPoints: { id: [points_array_[0].id], xO: posOx, zO: posOz, xT: posTx, zT: posTz } }; 
					element.BegEnd =  'start'; 
				} 
			});



			// находим центр между двумя основными точками
			findMiddlePoint(points_array_[0], points_array_[1]) 
			// находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны, но уже для центральной точки, между двумя основными
			calculateNormal(middleVector, points_array_[1].position)
			position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
			middlePointO = position // серединная точка lines_array_[0]
			//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
			position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
			middlePointT = position // серединная точка lines_array_[1]
			//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz



			calculateNormal(points_array_[1].position, points_array_[0].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
			position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
			LinePointsO_arr.push(position) // пуш в массив последней точки lines_array_[0]
			//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
			position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
			LinePointsT_arr.push(position) // пуш в массив последней точки lines_array_[1]
			//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz
			// присваиваем перпендикуляры к точке в качестве аттрибутов
			points_array_[1].PointPositionWC = { attachedPoints: { id: [points_array_[1].id], xO: posTx, zO: posTz, xT: posOx, zT: posOz } };
			points_array_[1].BegEnd = 'end'
			//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
			points_array.forEach(function(element) { 
				if (element.id === points_array_[1].id) { 
				 	element.PointPositionWC = { attachedPoints: { id: [points_array_[1].id], xO: posOx, zO: posOz, xT: posTx, zT: posTz } }; 
					element.BegEnd =  'end'; 
				} 
			});

			
			createLine(LinePointsO_arr[0].x, LinePointsO_arr[0].z, LinePointsT_arr[1].x, LinePointsT_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
			createLine(LinePointsT_arr[0].x, LinePointsT_arr[0].z, LinePointsO_arr[1].x, LinePointsO_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
			lines_array_[0].metadata = { pointsPos: LinePointsO_arr, middlePos: middlePointO } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
			lines_array_[0].ValCombination = { value: [points_array_[0].ValCombination, points_array_[1].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
			lines_array_[1].metadata = { pointsPos: LinePointsT_arr, middlePos: middlePointT } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
			lines_array_[1].ValCombination = { value: [points_array_[0].ValCombination, points_array_[1].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
			
			/// test segment ///
			//console.log(points_array)
			//console.log(lines_array_)

		}
		if(points_counter >= 3){
			creating()
		}
	}));
	function creating(){

		ValueValidatorSphere = 'Side' // обозначаем, что далее идут points со значением side, которые не добавляются в массивы points_array и points_array_
		LinePointsO_arr = []; // обнуление точек перпендикуляров
		LinePointsT_arr = []; // обнуление точек перпендикуляров
		if(points_counter >=4){
			endPoints = []; // обнуление самых дальних точек линий(EndPoints)
			points_array_.shift(); // удаление из массива первой точки, чтобы соблюдать технологию, при которой идёт смещение: 1 - 2 - 3; 1 - 2 - 3 - 4; (удаление первого) 2 - 3 - 4;
			lines_array_.shift(); // аналогичная ситуация как с points_array_ но уже для линий по бокам
			lines_array_.shift();
		}

		calculateNormal(points_array_[2].position, points_array_[1].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив первой точки lines_array_[0]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
		LinePointsT_arr.push(position) // пуш в массив последней точки lines_array_[1]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz
		// присваиваем перпендикуляры к точке в качестве аттрибутов
		points_array_[2].PointPositionWC = { attachedPoints: { id: [points_array_[2].id], xO: posTx, zO: posTz, xT: posOx, zT: posOz } };
		points_array_[2].BegEnd = 'end'
		//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[2] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
		points_array.forEach(function(element) { 
			if (element.id === points_array_[2].id) { 
				element.PointPositionWC = { attachedPoints: { id: [points_array_[2].id], xO: posOx, zO: posOz, xT: posTx, zT: posTz } }; 
				element.BegEnd =  'end'; 
			} 
		});



		// находим центр между двумя основными точками
		findMiddlePoint(points_array_[2], points_array_[1]) 
		// находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны, но уже для центральной точки, между двумя основными
		calculateNormal(middleVector, points_array_[2].position)
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		middlePointO = position // серединная точка lines_array_[0]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
		middlePointT = position // серединная точка lines_array_[1]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz



		calculateNormal(points_array_[1].position, points_array_[2].position) // находим точки(перпендикуляры): posOx и posOz с одной стороны posTx и posTz с другой стороны
		position = new BABYLON.Vector3(posOx, 0, posOz); // выставляем значение позиции на posOx и posOz
		LinePointsO_arr.push(position) // пуш в массив последней точки lines_array_[0]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posOx и posOz
		position = new BABYLON.Vector3(posTx, 0, posTz); // выставляем значение позиции на posTx и posTz
		LinePointsT_arr.push(position) // пуш в массив последней точки lines_array_[1]
		//createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению posTx и posTz

		
		createLine(LinePointsO_arr[0].x, LinePointsO_arr[0].z, LinePointsT_arr[1].x, LinePointsT_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
		createLine(LinePointsT_arr[0].x, LinePointsT_arr[0].z, LinePointsO_arr[1].x, LinePointsO_arr[1].z) // создаём линию по первой и последней точке, беря данные из LinePointsO_arr и LinePointsT_arr
		lines_array_[2].metadata = { pointsPos: LinePointsO_arr, middlePos: middlePointO } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
		lines_array_[2].ValCombination = { value: [points_array_[2].ValCombination, points_array_[1].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
		lines_array_[3].metadata = { pointsPos: LinePointsT_arr, middlePos: middlePointT } // устанавливаем линии аттрибут, который будет хранить в ней её крайние и серединную точку
		lines_array_[3].ValCombination = { value: [points_array_[2].ValCombination, points_array_[1].ValCombination] } // устанавливаем для линии точки соответствия(к кому она прикреплена)
		
		// Задаем точку, от которой будем искать самую дальнюю точку
		referencePoint = points_array_[1]._absolutePosition;
		
		// Перебираем все точки и находим самую дальнюю
		FindFarthestPoint();
		
		
		// Usage example:
		setIntersection(
			endPoints[0].x, endPoints[0].z, lines_array_[0].metadata.middlePos.x, lines_array_[0].metadata.middlePos.z,
			endPoints[3].x, endPoints[3].z, lines_array_[2].metadata.middlePos.x, lines_array_[2].metadata.middlePos.z,
		)
		position = new BABYLON.Vector3(interP.x, 0, interP.z)
		lines_array_[2].metadata.pointsPos[1] = position //обновление метадаты на точку пересечения для одной линии
		posOx = interP.x, posOz = interP.z
		createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению interP.x и interP.z

		/// test segment ///
		//console.log(lines_array_[2].metadata.pointsPos[0])

		//lines_array_[2].metadata.pointsPos[1] = position
		//createSphere(lines_array_[2].metadata.pointsPos[1], redMaterial_)

		//LinePointsO_arr[1] = position
		//if(points_counter == 3){
		//	center_point_x = (position.x + lines_array_[0].metadata.pointsPos[0].x) / 2;
		//	center_point_z = (position.z + lines_array_[0].metadata.pointsPos[0].z) / 2;
		//}else if(points_counter >= 4){
		//	center_point_x = (position.x + lines_array_[0].metadata.pointsPos[1].x) / 2;
		//	center_point_z = (position.z + lines_array_[0].metadata.pointsPos[1].z) / 2;
		//}
		//
		//middleVector = new BABYLON.Vector3(center_point_x, 0, center_point_z)
		//
		//createSphere(middleVector, redMaterial_)

		setIntersection(
			endPoints[1].x, endPoints[1].z, lines_array_[1].metadata.middlePos.x, lines_array_[1].metadata.middlePos.z,
			endPoints[2].x, endPoints[2].z, lines_array_[3].metadata.middlePos.x, lines_array_[3].metadata.middlePos.z,
		)
		position = new BABYLON.Vector3(interP.x, 0, interP.z)
		lines_array_[3].metadata.pointsPos[1] = position //обновление метадаты на точку пересечения для другой линии
		posTx = interP.x, posTz = interP.z
		createSphere(position, redMaterial_) // создаём меш круга(перпендикуляр) по значению interP.x и interP.z

		// присваиваем перпендикуляры к точке в качестве аттрибутов
		points_array_[1].PointPositionWC = { attachedPoints: { id: [points_array_[1].id], xO: posOx, zO: posOz, xT: posTx, zT: posTz } };
		//запускаем проверку массива points_array на поиск элемента с ID как у points_array_[1] и если мы его находит - то присваиваем к element значение аттрибута PointPositionWC 
		points_array_[1].BegEnd = 'middle'
		points_array.forEach(function(element) { 
			if (element.id === points_array_[1].id) { 
				element.PointPositionWC = { attachedPoints: { id: [points_array_[1].id], xO: posOx, zO: posOz, xT: posTx, zT: posTz } }; 
				element.BegEnd = 'middle'
			} 
		});

		/// test segment ///
		//console.log(points_array)
		//console.log(lines_array_[0].metadata.pointsPos[0])
		//createSphere(LinePointsO_arr[1], redMaterial_)
		//createSphere(lines_array_[3].metadata.pointsPos[1], redMaterial_) 
		
		//createSphere(lines_array_[2].metadata.pointsPos[1], redMaterial_)
		//createSphere(lines_array_[1].metadata.pointsPos[1], redMaterial_)
		
		//if(points_counter == 3){
		//	createSphere(lines_array_[0].metadata.pointsPos[0], redMaterial_)
		//}else if(points_counter >= 4){
		//	createSphere(lines_array_[0].metadata.pointsPos[1], redMaterial_)
		//}
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

	function findMiddlePoint(PosO, PosT){
		center_point_x = (PosO.position.x + PosT.position.x) / 2;
		center_point_z = (PosO.position.z + PosT.position.z) / 2;
		middleVector = new BABYLON.Vector3(center_point_x, 0, center_point_z)
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
		lines_array.push(line)
		lines_array_.push(line)
	}

	function calculateIntersection_sec(p1, p2, p3, p4) {
		c2x = p3.x - p4.x; // (x3 - x4)
		c3x = p1.x - p2.x; // (x1 - x2)
		c2z = p3.z - p4.z; // (y3 - y4)
		c3z = p1.z - p2.z; // (y1 - y2)
		
		// down part of intersection point formula
		d  = c3x * c2z - c3z * c2x;
		
		if (d == 0) {
		  throw new Error('Number of intersection points is zero or infinity.');
		}

		// upper part of intersection point formula
		u1 = p1.x * p2.z - p1.z * p2.x; // (x1 * y2 - y1 * x2)
		u4 = p3.x * p4.z - p3.z * p4.x; // (x3 * y4 - y3 * x4)

		// intersection point formula

		px = (u1 * c2x - c3x * u4) / d;
		pz = (u1 * c2z - c3z * u4) / d;

		p = { x: px, z: pz };

		return p;
	}

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

	function setIntersection(p1X, p1Z, p2X, p2Z, p3X, p3Z, p4X, p4Z){
		// line 1
		p1I = { x:  p1X, z:  p1Z }; // P1: (x1, y1)
		p2I = { x:  p2X, z:  p2Z}; // P2: (x2, y2)
					
		// line 2
		p3I = { x:  p3X, z:  p3Z }; // P3: (x4, y4)
		p4I = { x:  p4X, z:  p4Z }; // P4: (x4, y4)

		interP = calculateIntersection_sec(p1I, p2I, p3I, p4I);
	}
}

function createSphere(position_, material_){
	
	// Создание sphere в позиции нажатия
	var sphere = BABYLON.MeshBuilder.CreateSphere("sphere", { segments: 32, diameter: 0.10 }, scene); //scene is 
	sphere.material = material_ // присваиваем материал сфере
	sphere.position = position_; // присваиваем позицию сфере
	sphere.onPointerDown = function () {
		// Проверка значения атрибута BegEnd и вывод в консоль

			console.log("abobus");
		
	};

	if(ValueValidatorSphere == 'Main'){
		// функция генерации уникального ID сфере
		for (let i = 0; i < characters.length; i++) {
			var randomIndex = Math.floor(Math.random() * characters.length);
			SphereUniqueId += characters.charAt(randomIndex);
		}

		sphere.id = SphereUniqueId; // присваиваем ID сфере
		sphere.ValCombination = { combination: points_counter };
		sphere.ABOBUS = true;

		points_array.push(sphere) // пуш в массив всех points
		points_array_.push(sphere) // пуш в массив последних трёх points для вычисления перпендикуляров и пересечений
	}
}

var scene = createScene();
engine.runRenderLoop(function() {
	scene.render();
});
window.addEventListener("resize", function() {
	engine.resize();
});