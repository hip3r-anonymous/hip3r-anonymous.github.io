window.HIP3R_INTERACTIVE = {
  "schema": 1,
  "scenes": [
    {
      "id": "library-walk",
      "title": "Library walk",
      "preview": "assets/maps/vggt-omega/case-01/hip3r/preview.jpg",
      "previewLight": "assets/maps/vggt-omega/case-01/hip3r/preview.png",
      "models": {
        "omega": {
          "dense": {
            "url": "assets/maps/vggt-omega/case-01/hip3r/scene.glb",
            "bytes": 4801248,
            "points": 300000
          },
          "sparse": {
            "url": "assets/maps/vggt-omega/case-01/hip3r/scene-sparse.glb",
            "bytes": 1601272,
            "points": 100000
          },
          "preview": "assets/maps/vggt-omega/case-01/hip3r/preview.jpg",
          "previewLight": "assets/maps/vggt-omega/case-01/hip3r/preview.png",
          "viewRotation": 90,
          "viewTransform": ""
        }
      },
      "preferredModel": "omega",
      "inputVideo": {
        "url": "assets/interactive/input-media/library-walk/input.mp4",
        "poster": "assets/interactive/input-media/library-walk/poster.jpg",
        "trajectoryUrl": "assets/interactive/input-media/library-walk/trajectory.json",
        "fps": 10,
        "frameCount": 320,
        "timingLabel": "Sampled input \u00b7 10 fps"
      }
    },
    {
      "id": "kitti-drive",
      "title": "KITTI drive",
      "preview": "assets/maps/lingbot-map/case-00/hip3r/preview.jpg?v=hip3r-20260925-map-kitti-1",
      "previewLight": "assets/maps/lingbot-map/case-00/hip3r/preview.png?v=hip3r-20260925-map-kitti-1",
      "models": {
        "omega": {
          "dense": {
            "url": "assets/maps/vggt-omega/case-00/hip3r/scene.glb",
            "bytes": 4801208,
            "points": 300000
          },
          "sparse": {
            "url": "assets/maps/vggt-omega/case-00/hip3r/scene-sparse.glb",
            "bytes": 1601236,
            "points": 100000
          },
          "preview": "assets/maps/vggt-omega/case-00/hip3r/preview.jpg",
          "previewLight": "assets/maps/vggt-omega/case-00/hip3r/preview.png",
          "viewRotation": 0,
          "viewTransform": "flip_horizontal"
        },
        "map": {
          "dense": {
            "url": "assets/maps/lingbot-map/case-00/hip3r/scene.glb",
            "bytes": 4801240,
            "points": 300000
          },
          "sparse": {
            "url": "assets/maps/lingbot-map/case-00/hip3r/scene-sparse.glb",
            "bytes": 1601268,
            "points": 100000
          },
          "preview": "assets/maps/lingbot-map/case-00/hip3r/preview.jpg?v=hip3r-20260925-map-kitti-1",
          "previewLight": "assets/maps/lingbot-map/case-00/hip3r/preview.png?v=hip3r-20260925-map-kitti-1",
          "viewRotation": 0,
          "viewTransform": "flip_horizontal"
        }
      },
      "preferredModel": "map",
      "inputVideo": {
        "url": "assets/interactive/input-media/kitti-drive/input.mp4",
        "poster": "assets/interactive/input-media/kitti-drive/poster.jpg",
        "trajectoryUrl": "assets/interactive/input-media/kitti-drive/trajectory.json",
        "fps": 10,
        "frameCount": 400,
        "timingLabel": "Sampled input \u00b7 10 fps"
      }
    },
    {
      "id": "outdoor-walk",
      "title": "Outdoor walk",
      "preview": "assets/maps/lingbot-map/case-01/hip3r/preview.jpg?v=hip3r-20260923-dense-tiles-1",
      "previewLight": "assets/maps/lingbot-map/case-01/hip3r/preview.png?v=hip3r-20260923-dense-tiles-1",
      "models": {
        "map": {
          "dense": {
            "url": "assets/maps/lingbot-map/case-01/hip3r/scene.glb",
            "bytes": 4800956,
            "points": 300000
          },
          "sparse": {
            "url": "assets/maps/lingbot-map/case-01/hip3r/scene-sparse.glb",
            "bytes": 1600988,
            "points": 100000
          },
          "preview": "assets/maps/lingbot-map/case-01/hip3r/preview.jpg?v=hip3r-20260923-dense-tiles-1",
          "previewLight": "assets/maps/lingbot-map/case-01/hip3r/preview.png?v=hip3r-20260923-dense-tiles-1",
          "viewRotation": 0,
          "viewTransform": ""
        }
      },
      "preferredModel": "map",
      "inputVideo": {
        "url": "assets/interactive/input-media/outdoor-walk/input.mp4",
        "poster": "assets/interactive/input-media/outdoor-walk/poster.jpg",
        "trajectoryUrl": "assets/interactive/input-media/outdoor-walk/trajectory.json",
        "fps": 10,
        "frameCount": 400,
        "timingLabel": "Sampled input \u00b7 10 fps"
      }
    },
    {
      "id": "flight",
      "title": "Flight",
      "preview": "assets/interactive/flight/omega/preview.jpg",
      "previewLight": "assets/interactive/flight/omega/preview.png",
      "models": {
        "omega": {
          "dense": {
            "url": "assets/interactive/flight/omega/scene.glb",
            "bytes": 16001040,
            "points": 1000000
          },
          "sparse": {
            "url": "assets/interactive/flight/omega/scene-sparse.glb",
            "bytes": 1601032,
            "points": 100000
          }
        }
      },
      "preferredModel": "omega",
      "inputVideo": {
        "url": "assets/interactive/input-media/flight/input.mp4",
        "poster": "assets/interactive/input-media/flight/poster.jpg",
        "trajectoryUrl": "assets/interactive/input-media/flight/trajectory.json",
        "fps": 10,
        "frameCount": 323,
        "timingLabel": "Sampled input \u00b7 10 fps"
      }
    },
    {
      "id": "old-town",
      "title": "Old Town",
      "preview": "assets/interactive/old-town/omega/preview.jpg",
      "previewLight": "assets/interactive/old-town/omega/preview.png",
      "models": {
        "omega": {
          "dense": {
            "url": "assets/interactive/old-town/omega/scene.glb",
            "bytes": 16001040,
            "points": 1000000
          },
          "sparse": {
            "url": "assets/interactive/old-town/omega/scene-sparse.glb",
            "bytes": 1601036,
            "points": 100000
          }
        }
      },
      "preferredModel": "omega",
      "inputVideo": {
        "url": "assets/interactive/input-media/old-town/input.mp4",
        "poster": "assets/interactive/input-media/old-town/poster.jpg",
        "trajectoryUrl": "assets/interactive/input-media/old-town/trajectory.json",
        "fps": 10,
        "frameCount": 1000,
        "timingLabel": "Sampled input \u00b7 10 fps"
      }
    },
    {
      "id": "street-drive",
      "title": "Street Drive",
      "preview": "assets/interactive/street-drive/omega/preview.jpg",
      "previewLight": "assets/interactive/street-drive/omega/preview.png",
      "models": {
        "omega": {
          "dense": {
            "url": "assets/interactive/street-drive/omega/scene.glb",
            "bytes": 16001040,
            "points": 1000000
          },
          "sparse": {
            "url": "assets/interactive/street-drive/omega/scene-sparse.glb",
            "bytes": 1601032,
            "points": 100000
          }
        }
      },
      "preferredModel": "omega",
      "inputVideo": {
        "url": "assets/interactive/input-media/street-drive/input.mp4",
        "poster": "assets/interactive/input-media/street-drive/poster.jpg",
        "trajectoryUrl": "assets/interactive/input-media/street-drive/trajectory.json",
        "fps": 10,
        "frameCount": 1575,
        "timingLabel": "Sampled input \u00b7 10 fps"
      }
    }
  ]
};
