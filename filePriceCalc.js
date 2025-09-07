import * as THREE from "https://cdn.skypack.dev/three@0.149.0/build/three.module";

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
  constructor(id) {
    this.id = id;
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
    let loader = new STLLoader();
    let stlMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    loader.load(
      URL.createObjectURL(pointer.FILE),
      function (geometry) {
        pointer.mesh = new THREE.Mesh(geometry, stlMaterial);
        pointer.name = pointer.FILE.name;
        let box = new THREE.Box3().setFromObject(pointer.mesh);
        pointer.boxSize = new THREE.Vector3();
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
          let t1 = new THREE.Vector3(
            positions[i + 0],
            positions[i + 1],
            positions[i + 2]
          );
          let t2 = new THREE.Vector3(
            positions[i + 3],
            positions[i + 4],
            positions[i + 5]
          );
          let t3 = new THREE.Vector3(
            positions[i + 6],
            positions[i + 7],
            positions[i + 8]
          );
          var triangle = new THREE.Triangle(t1, t2, t3);
          let normal = new THREE.Vector3();
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

/**
 * Minified by jsDelivr using Terser v5.37.0.
 * Original file: /npm/stl-loader@1.0.0/STLLoader.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
(THREE.STLLoader = function () {}),
  (THREE.STLLoader.prototype = {
    constructor: THREE.STLLoader,
    addEventListener: THREE.EventDispatcher.prototype.addEventListener,
    hasEventListener: THREE.EventDispatcher.prototype.hasEventListener,
    removeEventListener: THREE.EventDispatcher.prototype.removeEventListener,
    dispatchEvent: THREE.EventDispatcher.prototype.dispatchEvent,
  }),
  (THREE.STLLoader.prototype.load = function (t, e) {
    var r = this,
      n = new XMLHttpRequest();
    n.addEventListener(
      "load",
      function (n) {
        if (200 === n.target.status || 0 === n.target.status) {
          var o = r.parse(n.target.response || n.target.responseText);
          r.dispatchEvent({ type: "load", content: o }), e && e(o);
        } else
          r.dispatchEvent({
            type: "error",
            message: "Couldn't load URL [" + t + "]",
            response: n.target.responseText,
          });
      },
      !1
    ),
      n.addEventListener(
        "progress",
        function (t) {
          r.dispatchEvent({
            type: "progress",
            loaded: t.loaded,
            total: t.total,
          });
        },
        !1
      ),
      n.addEventListener(
        "error",
        function () {
          r.dispatchEvent({
            type: "error",
            message: "Couldn't load URL [" + t + "]",
          });
        },
        !1
      ),
      n.overrideMimeType("text/plain; charset=x-user-defined"),
      n.open("GET", t, !0),
      (n.responseType = "arraybuffer"),
      n.send(null);
  }),
  (THREE.STLLoader.prototype.parse = function (t) {
    var e,
      r = this.ensureBinary(t);
    return 84 + 50 * (e = new DataView(r)).getUint32(80, !0) === e.byteLength
      ? this.parseBinary(r)
      : this.parseASCII(this.ensureString(t));
  }),
  (THREE.STLLoader.prototype.parseBinary = function (t) {
    var e, r, n, o, a, s, i, p, h;
    for (
      n = (o = new DataView(t)).getUint32(80, !0),
        r = new THREE.Geometry(),
        e = 0;
      e < n;
      e++
    ) {
      for (
        p = 84 + 50 * e,
          s = new THREE.Vector3(
            o.getFloat32(p, !0),
            o.getFloat32(p + 4, !0),
            o.getFloat32(p + 8, !0)
          ),
          i = 1;
        i <= 3;
        i++
      )
        (h = p + 12 * i),
          r.vertices.push(
            new THREE.Vector3(
              o.getFloat32(h, !0),
              o.getFloat32(h + 4, !0),
              o.getFloat32(h + 8, !0)
            )
          );
      (a = r.vertices.length),
        r.faces.push(new THREE.Face3(a - 3, a - 2, a - 1, s));
    }
    return r.computeBoundingSphere(), r;
  }),
  (THREE.STLLoader.prototype.parseASCII = function (t) {
    var e, r, n, o, a, s, i, p;
    for (
      e = new THREE.Geometry(), o = /facet([\s\S]*?)endfacet/g;
      null != (i = o.exec(t));

    ) {
      for (
        p = i[0],
          a =
            /normal[\s]+([\-+]?[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+/g;
        null != (i = a.exec(p));

      )
        n = new THREE.Vector3(
          parseFloat(i[1]),
          parseFloat(i[3]),
          parseFloat(i[5])
        );
      for (
        s =
          /vertex[\s]+([\-+]?[0-9]+\.?[0-9]*([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+[\s]+([\-+]?[0-9]*\.?[0-9]+([eE][\-+]?[0-9]+)?)+/g;
        null != (i = s.exec(p));

      )
        e.vertices.push(
          new THREE.Vector3(
            parseFloat(i[1]),
            parseFloat(i[3]),
            parseFloat(i[5])
          )
        );
      (r = e.vertices.length),
        e.faces.push(new THREE.Face3(r - 3, r - 2, r - 1, n));
    }
    return (
      e.computeCentroids(), e.computeBoundingBox(), e.computeBoundingSphere(), e
    );
  }),
  (THREE.STLLoader.prototype.ensureString = function (t) {
    if ("string" != typeof t) {
      for (var e = new Uint8Array(t), r = "", n = 0; n < t.byteLength; n++)
        r += String.fromCharCode(e[n]);
      return r;
    }
    return t;
  }),
  (THREE.STLLoader.prototype.ensureBinary = function (t) {
    if ("string" == typeof t) {
      for (var e = new Uint8Array(t.length), r = 0; r < t.length; r++)
        e[r] = 255 & t.charCodeAt(r);
      return e.buffer || e;
    }
    return t;
  }),
  "undefined" == typeof DataView &&
    ((DataView = function (t, e, r) {
      (this.buffer = t),
        (this.byteOffset = e || 0),
        (this.byteLength = r || t.byteLength || t.length),
        (this._isString = "string" == typeof t);
    }),
    (DataView.prototype = {
      _getCharCodes: function (t, e, r) {
        for (
          var n = (e = e || 0) + (r = r || t.length), o = [], a = e;
          a < n;
          a++
        )
          o.push(255 & t.charCodeAt(a));
        return o;
      },
      _getBytes: function (t, e, r) {
        var n;
        if (
          (void 0 === r && (r = this._littleEndian),
          (e = void 0 === e ? this.byteOffset : this.byteOffset + e),
          void 0 === t && (t = this.byteLength - e),
          "number" != typeof e)
        )
          throw new TypeError("DataView byteOffset is not a number");
        if (t < 0 || e + t > this.byteLength)
          throw new Error(
            "DataView length or (byteOffset+length) value is out of bounds"
          );
        return (
          (n = this.isString
            ? this._getCharCodes(this.buffer, e, e + t)
            : this.buffer.slice(e, e + t)),
          !r &&
            t > 1 &&
            (n instanceof Array || (n = Array.prototype.slice.call(n)),
            n.reverse()),
          n
        );
      },
      getFloat64: function (t, e) {
        var r = this._getBytes(8, t, e),
          n = 1 - 2 * (r[7] >> 7),
          o = ((((r[7] << 1) & 255) << 3) | (r[6] >> 4)) - 1023,
          a =
            (15 & r[6]) * Math.pow(2, 48) +
            r[5] * Math.pow(2, 40) +
            r[4] * Math.pow(2, 32) +
            r[3] * Math.pow(2, 24) +
            r[2] * Math.pow(2, 16) +
            r[1] * Math.pow(2, 8) +
            r[0];
        return 1024 === o
          ? 0 !== a
            ? NaN
            : n * (1 / 0)
          : -1023 === o
          ? n * a * Math.pow(2, -1074)
          : n * (1 + a * Math.pow(2, -52)) * Math.pow(2, o);
      },
      getFloat32: function (t, e) {
        var r = this._getBytes(4, t, e),
          n = 1 - 2 * (r[3] >> 7),
          o = (((r[3] << 1) & 255) | (r[2] >> 7)) - 127,
          a = ((127 & r[2]) << 16) | (r[1] << 8) | r[0];
        return 128 === o
          ? 0 !== a
            ? NaN
            : n * (1 / 0)
          : -127 === o
          ? n * a * Math.pow(2, -149)
          : n * (1 + a * Math.pow(2, -23)) * Math.pow(2, o);
      },
      getInt32: function (t, e) {
        var r = this._getBytes(4, t, e);
        return (r[3] << 24) | (r[2] << 16) | (r[1] << 8) | r[0];
      },
      getUint32: function (t, e) {
        return this.getInt32(t, e) >>> 0;
      },
      getInt16: function (t, e) {
        return (this.getUint16(t, e) << 16) >> 16;
      },
      getUint16: function (t, e) {
        var r = this._getBytes(2, t, e);
        return (r[1] << 8) | r[0];
      },
      getInt8: function (t) {
        return (this.getUint8(t) << 24) >> 24;
      },
      getUint8: function (t) {
        return this._getBytes(1, t)[0];
      },
    }));
//# sourceMappingURL=/sm/1d5d05b728d3e93ed496892cad31f4db8072e0e4e9d37addd7c293bf84ca97f7.map
