// Global game state, mirroring the C globals spread across the original source files.

export const kXSize = 640;
export const kYSize = 480;

// objects.h
export const kObjectNoInput = 0;
export const kObjectDriveUp = 1;
export const kObjectDriveDown = 2;
export const kObjectCrossRoad = 3;
export const kObjectCopControl = 4;

// type.flags
export const kObjectWheelFlag = 1 << 0;
export const kObjectSolidFrictionFlag = 1 << 1;
export const kObjectBackCollFlag = 1 << 2;
export const kObjectRandomFrameFlag = 1 << 3;
export const kObjectDieWhenAnimEndsFlag = 1 << 4;
export const kObjectDefaultDeath = 1 << 5;
export const kObjectFollowMarks = 1 << 6;
export const kObjectOvertake = 1 << 7;
export const kObjectSlow = 1 << 8;
export const kObjectLong = 1 << 9;
export const kObjectKilledByCars = 1 << 10;
export const kObjectKillsCars = 1 << 11;
export const kObjectBounce = 1 << 12;
export const kObjectCop = 1 << 13;
export const kObjectHeliFlag = 1 << 14;
export const kObjectBonusFlag = 1 << 15;
// type.flags2
export const kObjectAddOnFlag = 1 << 0;
export const kObjectFrontCollFlag = 1 << 1;
export const kObjectOil = 1 << 2;
export const kObjectMissile = 1 << 3;
export const kObjectRoadKill = 1 << 4;
export const kObjectEngineSound = 1 << 7;
export const kObjectRamp = 1 << 8;
export const kObjectSink = 1 << 9;
export const kObjectDamageble = 1 << 10;
export const kObjectDieWhenOutOfScreen = 1 << 11;
export const kObjectRearDrive = 1 << 12;
export const kObjectRearSteer = 1 << 13;
export const kObjectFloating = 1 << 14;
export const kObjectBump = 1 << 15;

export const kAddOnLock = 1 << 3;
export const kAddOnCop = 1 << 4;
export const kAddOnTurbo = 1 << 5;
export const kAddOnSpikes = 1 << 6;

export const kFrontBumper = 1 << 0;
export const kBackBumper = 1 << 1;
export const kFrontLeftTire = 1 << 2;
export const kFrontRightTire = 1 << 3;
export const kBackLeftTire = 1 << 4;
export const kBackRightTire = 1 << 5;
export const kLeftDoor = 1 << 6;
export const kRightDoor = 1 << 7;
export const kMotor = 1 << 8;

export const kNumLayers = 4;

export const kMaxTracks = 4096;
export const kCalcFPS = 60.0;
export const kFrameDuration = 1 / kCalcFPS;
export const kLowCalcRatio = 4;
export const kLowFrameDuration = kLowCalcRatio / kCalcFPS;
export const kLowCalcFPS = kCalcFPS / kLowCalcRatio;
export const kScale = 9.0;
export const kMinCarDist = 25;
export const kVisDist = 1500;

export const kNormalPlayerCarID = 128;
export const kNormalPlayerBoatID = 201;

// roads.h
export const kTargetOvertake = 1;
export const kTargetNoStop = 2;

// renderframe.h
export const kMaxZoomVelo = 80.0;
export const kInvLines = 0;

// input.h
export const kForward = 0;
export const kBackward = 1;
export const kLeft = 2;
export const kRight = 3;
export const kKickdown = 4;
export const kBrake = 5;
export const kFire = 6;
export const kMissile = 7;
export const kAbort = 8;
export const kPause = 9;
export const kNumElements = 10;

export function newInputData() {
  return { steering: 0, throttle: 0, brake: 0, handbrake: 0, reverse: 0, kickdown: 0 };
}

export function newTrackSeg() {
  return { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, intensity: 0, time: 0 };
}

export const G = {
  // data (set at init)
  data: null,
  prefs: null,
  registered: true,

  // screen
  screenBlitSpecial: false,

  // frame timing
  frameCount: 0,
  graphFrameCount: 0,
  startMS: 0,
  pauseMS: 0,
  endGame: false,
  pauseRequested: false,

  // level
  levelID: 0,
  roadData: null,
  roadLength: 0,
  roadInfo: null,
  levelData: null,
  trackUp: null,
  trackDown: null,
  marks: null,
  markSize: 0,

  // objects
  firstObj: null,
  cameraObj: null,
  playerObj: null,
  spikeObj: null,
  brakeObj: null,
  firstVisObj: null,
  lastVisObj: null,
  tracks: Array.from({ length: kMaxTracks }, newTrackSeg),
  trackCount: 0,

  // player
  playerLives: 0,
  extraLives: 0,
  numMissiles: 0,
  numMines: 0,
  playerDeathDelay: 0,
  finishDelay: 0,
  playerScore: 0,
  displayScore: 0,
  playerBonus: 1,
  playerAddOns: 0,
  gameTime: 0,
  xDriftPos: 0,
  yDriftPos: 0,
  xFrontDriftPos: 0,
  yFrontDriftPos: 0,
  zoomVelo: 0,
  playerSlide: [0, 0, 0, 0],
  spikeFrame: 0,
  playerCarID: kNormalPlayerCarID,
  lCheat: false,
  gameOn: false,
  exit: false,

  // input
  fire: false,
  missile: false,
};
