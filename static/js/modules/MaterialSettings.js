export function ExportMaterialSettings(scene_, redMaterial_, blueMaterial_, doubleFaceMaterial_) {
    redMaterial_ = new BABYLON.StandardMaterial("ground", scene_);
    redMaterial_.emissiveColor = BABYLON.Color3.Red();

    blueMaterial_ = new BABYLON.StandardMaterial("ground", scene_);
    blueMaterial_.emissiveColor = BABYLON.Color3.Blue();

    doubleFaceMaterial_ = new BABYLON.StandardMaterial("material", scene_);
	doubleFaceMaterial_.backFaceCulling = false; // Делаем материал двусторонним

    return {
        redMaterial: redMaterial_,
        blueMaterial: blueMaterial_,
        doubleFaceMaterial: doubleFaceMaterial_,
    };

}