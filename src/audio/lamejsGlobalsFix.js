// lamejs ships two forms: a prebuilt browser bundle (lame.all.js) that
// concatenates every internal file into one shared function scope, and
// the raw CommonJS source under src/js/ that this app actually imports
// (via the package's "main" field). Several of those raw source files
// reference each other's classes as bare globals instead of requiring
// them — e.g. Lame.js uses `MPEGMode.NOT_SET` with no `require` for
// MPEGMode at all, BitStream.js uses `Lame.LAME_MAXMP3BUFFER` with no
// require for Lame, and so on. That's invisible until the specific code
// path referencing one of them actually executes, so it surfaces one at
// a time as a fresh "X is not defined" ReferenceError deep inside
// Mp3Encoder — first MPEGMode, then Lame, and potentially others still
// undiscovered.
//
// Rather than patching these one at a time as each is hit, this imports
// every one of lamejs's internal classes directly from its own source
// file and attaches it to globalThis under its own name, up front —
// reproducing what lame.all.js gets for free by concatenating everything
// into one scope, without switching away from the properly-tree-shaken
// per-file imports.
import ATH from "lamejs/src/js/ATH.js";
import BitStream from "lamejs/src/js/BitStream.js";
import CBRNewIterationLoop from "lamejs/src/js/CBRNewIterationLoop.js";
import CalcNoiseData from "lamejs/src/js/CalcNoiseData.js";
import CalcNoiseResult from "lamejs/src/js/CalcNoiseResult.js";
import Encoder from "lamejs/src/js/Encoder.js";
import FFT from "lamejs/src/js/FFT.js";
import GainAnalysis from "lamejs/src/js/GainAnalysis.js";
import GrInfo from "lamejs/src/js/GrInfo.js";
import IIISideInfo from "lamejs/src/js/IIISideInfo.js";
import III_psy_ratio from "lamejs/src/js/III_psy_ratio.js";
import III_psy_xmin from "lamejs/src/js/III_psy_xmin.js";
import L3Side from "lamejs/src/js/L3Side.js";
import Lame from "lamejs/src/js/Lame.js";
import LameGlobalFlags from "lamejs/src/js/LameGlobalFlags.js";
import LameInternalFlags from "lamejs/src/js/LameInternalFlags.js";
import MPEGMode from "lamejs/src/js/MPEGMode.js";
import MeanBits from "lamejs/src/js/MeanBits.js";
import NewMDCT from "lamejs/src/js/NewMDCT.js";
import NsPsy from "lamejs/src/js/NsPsy.js";
import Presets from "lamejs/src/js/Presets.js";
import PsyModel from "lamejs/src/js/PsyModel.js";
import Quantize from "lamejs/src/js/Quantize.js";
import QuantizePVT from "lamejs/src/js/QuantizePVT.js";
import ReplayGain from "lamejs/src/js/ReplayGain.js";
import Reservoir from "lamejs/src/js/Reservoir.js";
import ScaleFac from "lamejs/src/js/ScaleFac.js";
import Tables from "lamejs/src/js/Tables.js";
import Takehiro from "lamejs/src/js/Takehiro.js";
import VBRQuantize from "lamejs/src/js/VBRQuantize.js";
import VBRSeekInfo from "lamejs/src/js/VBRSeekInfo.js";
import VBRTag from "lamejs/src/js/VBRTag.js";
import Version from "lamejs/src/js/Version.js";

const internalClasses = {
  ATH,
  BitStream,
  CBRNewIterationLoop,
  CalcNoiseData,
  CalcNoiseResult,
  Encoder,
  FFT,
  GainAnalysis,
  GrInfo,
  IIISideInfo,
  III_psy_ratio,
  III_psy_xmin,
  L3Side,
  Lame,
  LameGlobalFlags,
  LameInternalFlags,
  MPEGMode,
  MeanBits,
  NewMDCT,
  NsPsy,
  Presets,
  PsyModel,
  Quantize,
  QuantizePVT,
  ReplayGain,
  Reservoir,
  ScaleFac,
  Tables,
  Takehiro,
  VBRQuantize,
  VBRSeekInfo,
  VBRTag,
  Version,
};

for (const [name, value] of Object.entries(internalClasses)) {
  if (typeof globalThis[name] === "undefined") globalThis[name] = value;
}
