let runtime;
async function loadCV() {
  if (!runtime)
    runtime = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/opencv.js';
      script.onload = async () => {
        try {
          resolve(await window.cv);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => {
        runtime = null;
        reject(new Error('Could not load the local OpenCV runtime. Run npm install.'));
      };
      document.head.appendChild(script);
    });
  return runtime;
}
/** Analysis runs on a small proxy; original upload bytes remain untouched. */
export async function analyzeImage(image) {
  const cv = await loadCV(),
    scale = Math.min(1, 512 / image.width),
    canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const src = cv.imread(canvas),
    gray = new cv.Mat(),
    edges = new cv.Mat(),
    mean = new cv.Mat(),
    std = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, edges, cv.CV_64F);
    cv.meanStdDev(edges, mean, std);
    return {
      width: image.width,
      height: image.height,
      luminance: Math.round(cv.mean(gray)[0]),
      edgeVariance: Math.round(std.data64F[0] ** 2),
      engine: 'OpenCV.js',
    };
  } finally {
    src.delete();
    gray.delete();
    edges.delete();
    mean.delete();
    std.delete();
  }
}
