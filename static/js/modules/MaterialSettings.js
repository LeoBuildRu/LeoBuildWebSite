export function ExportMaterialSettings(scene_, redMaterial_, blueMaterial_) {
    redMaterial_ = new BABYLON.StandardMaterial("ground", scene_);
    redMaterial_.emissiveColor = BABYLON.Color3.Red();

    blueMaterial_ = new BABYLON.StandardMaterial("ground", scene_);
    blueMaterial_.emissiveColor = BABYLON.Color3.Blue();

    return {
        redMaterial: redMaterial_,
        blueMaterial: blueMaterial_,
    };

}