//AudioWorkletProcessor pour récupérer les tampons audio du micro.

class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
    } 
    process(inputs, outputs) {
      const input = inputs[0];  
      if (input.length > 0) {
        this.port.postMessage(input[0]);
      }
      return true;
    }
  }
  
  registerProcessor("audio-processor", AudioProcessor);