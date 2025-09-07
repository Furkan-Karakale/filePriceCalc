export class PRICECALCULATOR {
  id;
  FILE;
  mesh;
  canFileReadeble = true;
  modelFileLoaded = new CustomEvent("modelFileLoaded", {
    detail: {
      data: this,
    },
  });
  loaded = 0;
  constructor(id, THREE, STLLoader) {
    this.id = id;
    this.THREE = THREE;
    this.STLLoader = STLLoader;
  }
  INIT = function (FILE) {
    this.FILE = FILE;
    if (FILE.name.split(`.`)[1].toUpperCase() == "STL") {
      this.loadSTLFile(FILE);
      return {
        status: `200`,
        data: `OK`,
      };
    } else {
      return {
        status: `400`,
        data: `${FILE.name} Bu dosya formatini desteklemiyoruz.`,
      };
    }
  };
  loadSTLFile = function (FILE) {
    let pointer = this;
    let loader = new this.STLLoader();
    let stlMaterial = new this.THREE.MeshBasicMaterial({ color: 0xffffff });

    loader.load(
      URL.createObjectURL(pointer.FILE),
      function (geometry) {
        pointer.mesh = new this.THREE.Mesh(geometry, stlMaterial);
        pointer.name = pointer.FILE.name;
        let box = new this.THREE.Box3().setFromObject(pointer.mesh);
        pointer.boxSize = new this.THREE.Vector3();
        box.getSize(pointer.boxSize);

        let calc = this.calVolume(pointer.mesh, box.min.z);
        pointer.volume = calc[0];
        pointer.surfaceArea = calc[1];
        pointer.supportVolume = calc[2];
        pointer.boundingBox = box;
        document.dispatchEvent(pointer.modelFileLoaded);
      },
      (xhr) => {
        this.loaded = (xhr.loaded / xhr.total) * 100;
      }
    );
  };
  calcPrice(
    manufacturingM,
    materialM,
    expensesM,
    selections = { infill: 15, wallCount: 2 }
  ) {
    if (!this.isItFit(this, manufacturingM.buildVolume))
      return {
        status: `400`,
        data: `${manufacturing.type} icin maksimum uretim icin
            ${manufacturing.buildVolume.x} × ${manufacturing.buildVolume.y} × ${manufacturing.buildVolume.z} mm'dir.
                Lutfen uretim seklini degistirin.`,
      };
    if (this.isItFit(this, manufacturingM.minBuildSize)) {
      return {
        status: `400`,
        data: `${manufacturing.type} icin minimum uretim icin
            ${manufacturing.minBuildSize.x} × ${manufacturing.minBuildSize.y} × ${manufacturing.minBuildSize.z} mm'dir.
                Lutfen uretim seklini degistirin.`,
      };
    }

    if (manufacturingM.type == `FDM`) {
      this.fdmCostCalculation(
        manufacturingM,
        materialM,
        expensesM,
        selections.infill,
        selections.wallCount
      );
    } else if (manufacturingM.type == `SLA`) {
      this.slaCostCalculation(manufacturingM, materialM, expensesM);
    }

    return {
      status: `200`,
      data: this.cost,
    };
  }
  fdmCostCalculation(manufacturing, material, expenses, infill, wallCount) {
    let ftmTlperMm3 = (material.density / 1000) * (material.price / 1000); // Tl/mm^3
    let wallVolume =
      this.surfaceArea * manufacturing.nozzleThickness * wallCount;
    if (wallVolume > this.volume) wallVolume = this.volume;
    let wallPrice = parseFloat(
      (wallVolume * material.density * ftmTlperMm3).toFixed(3)
    );
    let maxInternalPrice = parseFloat((this.volume * ftmTlperMm3).toFixed(3));
    let infillVolume = (this.volume - wallVolume) * (infill / 100);
    let supportCost = parseFloat(
      (this.supportVolume * ftmTlperMm3 * 0.15).toFixed(3)
    );
    let infillPrice = parseFloat((infillVolume * ftmTlperMm3).toFixed(3));
    let filamentCost = parseFloat((wallPrice + infillPrice).toFixed(3));
    if (maxInternalPrice < filamentCost) filamentCost = maxInternalPrice;

    this.modelWeight = ((wallVolume + infillVolume) * material.density) / 1000;
    this.supportWeight = (this.supportVolume * material.density) / 1000;
    this.weight = (this.modelWeight + this.supportWeight).toFixed(2);

    let wallPrintTime = wallVolume / material.printSpeed;
    let infillPrintTime = infillVolume / material.printSpeed;
    let supportPrintTime = this.supportVolume / material.printSpeed;
    this.printTime =
      (wallPrintTime + infillPrintTime + supportPrintTime) / 60 / 60 +
      manufacturing.preparationTime;
    let TlperHour = manufacturing.powerConsumption * expenses.kWPrice; // Tl/h
    let electricCost = parseFloat((this.printTime * TlperHour).toFixed(3));
    let deteriorationCost = parseFloat(
      (this.printTime * manufacturing.deteriorationPrice).toFixed(3)
    );
    this.laborCost = parseFloat(
      (this.printTime * manufacturing.laborMultiplier * expenses.price).toFixed(
        3
      )
    );
    this.cost = parseFloat(
      (
        (filamentCost +
          supportCost +
          deteriorationCost +
          electricCost +
          this.laborCost) *
        expenses.tax
      ).toFixed(2)
    );
  }
  slaCostCalculation(manufacturing, material, expenses) {
    const TlperMm3 = (material.density / 1000) * (material.price / 1000); // Tl/mm^3
    const TlperHour = manufacturing.powerConsumption * expenses.kWPrice; // Tl/h
    let lengthOfPart = this.getPrintHeight(this, manufacturing);
    let supportCost = parseFloat(
      (this.supportVolume * TlperMm3 * 0.15).toFixed(3)
    );
    this.printTime =
      lengthOfPart / material.printSpeed + manufacturing.preparationTime;
    this.modelWeight = (this.volume * material.density) / 1000;
    this.supportWeight = (this.supportVolume * material.density) / 1000;
    this.weight = (this.modelWeight + this.supportWeight).toFixed(2);
    let ResinCost = parseFloat(
      ((this.volume + this.supportVolume) * TlperMm3 * 1.25).toFixed(3)
    ); //1.25 = Support Material
    this.LaborCost = parseFloat(
      (this.printTime * expenses.price * manufacturing.laborMultiplier).toFixed(
        3
      )
    );
    let ElectricCost = parseFloat((this.printTime * TlperHour).toFixed(3));
    let DeteriorationCost = parseFloat(
      (this.printTime * manufacturing.deteriorationPrice).toFixed(3)
    );
    this.cost = parseFloat(
      (
        (this.LaborCost +
          supportCost +
          ResinCost +
          ElectricCost +
          DeteriorationCost) *
        expenses.tax
      ).toFixed(2)
    );
  }

  isItFit(object, volume) {
    let objectVolume = [object.boxSize.x, object.boxSize.y, object.boxSize.z];
    objectVolume.sort(function (a, b) {
      return b - a;
    });
    let buildVolume = [volume.x, volume.z, volume.z];
    buildVolume.sort(function (a, b) {
      return b - a;
    });
    if (
      objectVolume[0] < buildVolume[0] &&
      objectVolume[1] < buildVolume[1] &&
      objectVolume[2] < buildVolume[2]
    )
      return true;
    else return false;
  }

  calVolume(MESH, minZ) {
    let vol = 0;
    let surface = 0;
    let support = 0;
    MESH.traverse(function (child) {
      if (child instanceof THREE.Mesh) {
        let positions = child.geometry.getAttribute("position").array;
        for (let i = 0; i < positions.length; i += 9) {
          let t1 = new this.THREE.Vector3(
            positions[i + 0],
            positions[i + 1],
            positions[i + 2]
          );
          let t2 = new this.THREE.Vector3(
            positions[i + 3],
            positions[i + 4],
            positions[i + 5]
          );
          let t3 = new this.THREE.Vector3(
            positions[i + 6],
            positions[i + 7],
            positions[i + 8]
          );
          var triangle = new this.THREE.Triangle(t1, t2, t3);
          let normal = new this.THREE.Vector3();
          triangle.getNormal(normal);
          let angle =
            (Math.acos(
              normal.z /
                Math.sqrt(
                  normal.z * normal.z +
                    normal.y * normal.y +
                    normal.x * normal.x
                )
            ) *
              180) /
            Math.PI;
          vol += this.signedVolumeOfTriangle(t1, t2, t3);
          surface += this.areatriangle3d(t1, t2, t3);
          if ((angle > 0 && angle < 60) || (angle > 120 && angle < 180))
            support +=
              this.areatriangle3d(t1, t2, t3) *
              ((triangle.a.z + triangle.b.z + triangle.c.z) / 3 - minZ);
        }
      }
    });
    return [Math.round(vol), Math.round(surface), Math.round(support)];
  }

  distance3d = function (VecA, VecB) {
    let a =
      (VecA.x - VecB.x) ** 2 + (VecA.y - VecB.y) ** 2 + (VecA.z - VecB.z) ** 2;
    let d = a ** 0.5;
    return d;
  };

  heron = function (a, b, c) {
    let s = (a + b + c) / 2;
    let area = (s * (s - a) * (s - b) * (s - c)) ** 0.5;
    return area;
  };

  areatriangle3d = function (Vec1, Vec2, Vec3) {
    let a = this.distance3d(Vec1, Vec2);
    let b = this.distance3d(Vec2, Vec3);
    let c = this.distance3d(Vec3, Vec1);
    let A = this.heron(a, b, c);
    if (isNaN(A)) A = 0;
    return A;
  };

  signedVolumeOfTriangle = function (p1, p2, p3) {
    let v321 = p3.x * p2.y * p1.z;
    let v231 = p2.x * p3.y * p1.z;
    let v312 = p3.x * p1.y * p2.z;
    let v132 = p1.x * p3.y * p2.z;
    let v213 = p2.x * p1.y * p3.z;
    let v123 = p1.x * p2.y * p3.z;
    return (-v321 + v231 + v312 - v132 - v213 + v123) / 6;
  };

  getPrintHeight(object, manufacturing) {
    let DeltaX = object.boundingBox.max.x - object.boundingBox.min.x;
    let DeltaY = object.boundingBox.max.y - object.boundingBox.min.y;
    let DeltaZ = object.boundingBox.max.z - object.boundingBox.min.z;
    let LongestSide = [DeltaX, DeltaY, DeltaZ].sort(function (a, b) {
      return b - a;
    });
    let PrinterBuildArea = [
      manufacturing.buildVolume.x * 0.9,
      manufacturing.buildVolume.y * 0.9,
      manufacturing.buildVolume.z * 0.9,
    ].sort(function (a, b) {
      return b - a;
    });
    if (LongestSide[1] < PrinterBuildArea[2]) {
      if (LongestSide[0] < PrinterBuildArea[1]) {
        let degrees = 20;
        let lengthOfPart =
          LongestSide[0] * Math.sin((degrees * Math.PI) / 180) +
          LongestSide[2] * Math.cos((degrees * Math.PI) / 180);
        return lengthOfPart;
      } else {
        let a = Math.sqrt(LongestSide[0] ** 2 - PrinterBuildArea[1] ** 2);
        let degrees = Math.asin(a / LongestSide[0]);
        let lengthOfPart =
          LongestSide[0] * Math.sin(degrees) +
          LongestSide[2] * Math.cos(degrees);
        return lengthOfPart;
      }
    } else {
      let a = Math.sqrt(LongestSide[0] ** 2 - PrinterBuildArea[2] ** 2);
      let degrees = Math.asin(a / LongestSide[0]);
      let lengthOfPart =
        LongestSide[0] * Math.sin(degrees) + LongestSide[2] * Math.cos(degrees);
      return lengthOfPart;
    }
  }
}
