import GUI from "three/addons/libs/lil-gui.module.min.js";

export class ControlPanel {
  constructor(params, callbacks) {
    this.params = params;
    this.callbacks = callbacks;
    this.gui = null;
    this.zoomDistanceController = null;
    this.rollController = null;
  }

  setup() {
    this.gui = new GUI({ title: "Controls", width: 280 });

    this.gui
      .add(this.params, "pointSize", 0.1, 4, 0.05)
      .name("Point size")
      .onChange(() => this.callbacks.onPointSizeChange());

    this.gui
      .add(this.params, "opacity", 0.1, 1, 0.01)
      .name("Opacity")
      .onChange(() => this.callbacks.onOpacityChange());

    this.gui
      .add(this.params, "autoRotate")
      .name("Auto rotate")
      .onChange((v) => this.callbacks.onAutoRotateChange(v));

    this.gui
      .add(this.params, "fog")
      .name("Fog")
      .onChange((v) => this.callbacks.onFogChange(v));

    const helpersFolder = this.gui.addFolder("Helpers");
    helpersFolder
      .add(this.params, "showAxes")
      .name("Axes")
      .onChange(() => this.callbacks.onHelpersChange());
    helpersFolder
      .add(this.params, "showGrid")
      .name("Grid")
      .onChange(() => this.callbacks.onHelpersChange());
    helpersFolder
      .add(this.params, "showBbox")
      .name("Bounding box")
      .onChange(() => this.callbacks.onHelpersChange());

    const cameraFolder = this.gui.addFolder("Camera");
    this.zoomDistanceController = cameraFolder
      .add(this.params, "zoomDistance", 5, 600, 1)
      .name("Distance")
      .onChange((v) => this.callbacks.onZoomDistanceChange(v));
    this.zoomDistanceController.listen();

    this.rollController = cameraFolder
      .add(this.params, "roll", -180, 180, 0.1)
      .name("Roll")
      .onChange(() => this.callbacks.onRollChange());

    cameraFolder.add({ reset: () => this.callbacks.onCameraReset() }, "reset").name("Reset view");

    this.gui.add(this.params, "pointCount").name("Points").disable();
    this.gui.close();

    return {
      zoomDistance: this.zoomDistanceController,
      roll: this.rollController,
    };
  }

  updatePointCount(count) {
    this.params.pointCount = count.toLocaleString();
    this.gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
}
