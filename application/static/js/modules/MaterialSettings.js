export function ExportMaterialSettings(scene_, redMaterial_, blueMaterial_, doubleFaceMaterial_, FloorDefaultMaterial_, WallDefaultMaterial_, TargetMaterial_) {
    redMaterial_ = new BABYLON.StandardMaterial("ground", scene_);
    redMaterial_.emissiveColor = BABYLON.Color3.Red();
    redMaterial_.disableLighting = true;
    redMaterial_.receiveShadows = false; // отключаем возможность получения теней
    redMaterial_.backFaceCulling = false; // отключаем отбрасывание теней

    blueMaterial_ = new BABYLON.StandardMaterial("ground", scene_);
    blueMaterial_.emissiveColor = BABYLON.Color3.Blue();

    doubleFaceMaterial_ = new BABYLON.StandardMaterial("material", scene_);
	doubleFaceMaterial_.backFaceCulling = false; // Делаем материал двусторонним

    FloorDefaultMaterial_ = new BABYLON.StandardMaterial("material", scene_);
	FloorDefaultMaterial_.diffuseTexture = new BABYLON.Texture("/static/img/defaultFloor.jpg", scene_);
    FloorDefaultMaterial_.backFaceCulling = false;

    WallDefaultMaterial_ = new BABYLON.StandardMaterial("material", scene_);
	WallDefaultMaterial_.diffuseTexture = new BABYLON.Texture("/static/img/defaultWall.jpg", scene_);
    WallDefaultMaterial_.backFaceCulling = false;

    return {
        redMaterial: redMaterial_,
        blueMaterial: blueMaterial_,
        doubleFaceMaterial: doubleFaceMaterial_,
        FloorDefaultMaterial: FloorDefaultMaterial_,
        WallDefaultMaterial: WallDefaultMaterial_
    };

}