const OUTPUT_SAMPLE_RATE = 16000;
const REFRESH_RATE_MS = 20; 

/**
 * Ré-échantillonne un tampon Float32Array (Downsampling) par moyenne.
 * @param {Float32Array} buffer 
 * @param {number} inputSampleRate 
 * @param {number} outputSampleRate 
 * @returns {Float32Array}
 */
export const decreaseSampleRate = (
  buffer,
  inputSampleRate,
  outputSampleRate
) => {
  if (inputSampleRate <= outputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.ceil(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

/**
 * Convertit un tampon Float32Array  en Int16Array .
 * @param {Float32Array} buffer 
 * @returns {Int16Array} 
 */
export const convertFloat32ToInt16 = (buffer) => {
  let l = buffer.length;
  const buf = new Int16Array(l);
  const maxInt = 0x7fff;
  while (l--) {
    // S'assurer que l'échantillon est dans la plage [-1.0, 1.0]
    const sample = Math.max(-1.0, Math.min(1.0, buffer[l]));
    buf[l] = Math.round(sample * maxInt);
  }
  return buf;
};
