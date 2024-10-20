export function ExportSceneSettings(canvas_, engine_, scene_, camera_, light_, plane_, plane_material_) {
    scene_ = new BABYLON.Scene(engine_);
	// Устанавливаем цвет фона сцены
	scene_.clearColor = new BABYLON.Color4.FromInts(152, 229, 254, 255); // Установка цвета фона на белый (красный, зеленый, синий, alpha)

	plane_ = BABYLON.Mesh.CreateGround("ground", 1000, 1000, 1, scene_);
	plane_material_ = new BABYLON.StandardMaterial("material1", scene_);
	plane_material_.diffuseTexture = new BABYLON.Texture("/static/img/floor_.png", scene_); // Указываем путь к текстуре
	plane_material_.diffuseTexture.uScale = 100; // горизонтальное масштабирование текстуры
	plane_material_.diffuseTexture.vScale = 100; // вертикальное масштабирование текстуры
	plane_material_.diffuseTexture.hasAlpha = true;
	plane_material_.backFaceCulling = false;
	plane_.material = plane_material_;

	// Create the ArcRotateCamera
    camera_ = new BABYLON.ArcRotateCamera("camera", 13, 0.5, 10, BABYLON.Vector3.Zero(), scene_);
    camera_.attachControl(canvas_, true);
    camera_.wheelDeltaPercentage = 0.01;
    camera_.lowerBetaLimit = 0;
    camera_.upperBetaLimit = Math.PI / 2.1;

    // Устанавливаем общие параметры для обеих камер
    const setCommonCameraParams = () => {
        camera_.minZ = -100;
        camera_.maxZ = 1000;
    };

    // Set the scene's initial camera mode to perspective
    camera_.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
    setCommonCameraParams();

    // Function to set ortho camera parameters
    const setOrthoCameraParams = () => {
        const ratio = canvas_.height / canvas_.width;
        camera_.orthoLeft = -10 * camera_.radius / 10;
        camera_.orthoRight = 10 * camera_.radius / 10;
        camera_.orthoTop = camera_.orthoRight * ratio;
        camera_.orthoBottom = camera_.orthoLeft * ratio;
    }

    document.getElementById('ChageTo2D').addEventListener('click', (e)=> {
        camera_.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        setOrthoCameraParams();
        setCommonCameraParams();
    });

    document.getElementById('ChageTo3D').addEventListener('click', (e)=> {
        camera_.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
        setCommonCameraParams();
    });

    // Monitor changes in camera radius to update ortho params if needed
    let oldRadius = camera_.radius;
    scene_.onBeforeRenderObservable.add(() => {
        if (camera_.target.y < 0) {
            camera_.target.y = 0;
        }
        if (camera_.position.y < 0) {
            camera_.position.y = 0;
        }
        if (camera_.mode === BABYLON.Camera.ORTHOGRAPHIC_CAMERA && oldRadius !== camera_.radius) {
            setOrthoCameraParams();
            oldRadius = camera_.radius;
        }
    });

	// Добавляем туман
	const near_fog = 25;
	const far_fog = 30;
	const color_fog = new BABYLON.Color3(0.678, 0.847, 0.902); // Преобразуем цвет в формат Color3
	scene_.fogMode = BABYLON.Scene.FOGMODE_LINEAR; // Используем режим линейного тумана
	scene_.fogColor = color_fog; // Устанавливаем цвет тумана
	scene_.fogStart = near_fog; // Устанавливаем начало тумана
	scene_.fogEnd = far_fog; // Устанавливаем конец тумана

	light_ = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(5, 5, 5), scene_);
    light_.setEnabled(true);

    return {
        canvas: canvas_,
        engine: engine_,
        scene: scene_,
        camera: camera_,
        light: light_,
		plane: plane_,
		plane_material: plane_material_,
    };
}