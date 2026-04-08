"use jco";
import { environment, exit as exit$1, stderr, stdin, stdout } from '@bytecodealliance/preview2-shim/cli';
import { preopens, types } from '@bytecodealliance/preview2-shim/filesystem';
import { error, streams } from '@bytecodealliance/preview2-shim/io';
import { random } from '@bytecodealliance/preview2-shim/random';
const { getEnvironment } = environment;
getEnvironment._isHostProvided = true;

if (getEnvironment=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getEnvironment', was 'getEnvironment' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { exit } = exit$1;
exit._isHostProvided = true;

if (exit=== undefined) {
  const err = new Error("unexpectedly undefined local import 'exit', was 'exit' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStderr } = stderr;
getStderr._isHostProvided = true;

if (getStderr=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getStderr', was 'getStderr' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStdin } = stdin;
getStdin._isHostProvided = true;

if (getStdin=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getStdin', was 'getStdin' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getStdout } = stdout;
getStdout._isHostProvided = true;

if (getStdout=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getStdout', was 'getStdout' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getDirectories } = preopens;
getDirectories._isHostProvided = true;

if (getDirectories=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getDirectories', was 'getDirectories' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Descriptor,
  filesystemErrorCode } = types;
Descriptor._isHostProvided = true;

if (Descriptor=== undefined) {
  const err = new Error("unexpectedly undefined local import 'Descriptor', was 'Descriptor' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

filesystemErrorCode._isHostProvided = true;

if (filesystemErrorCode=== undefined) {
  const err = new Error("unexpectedly undefined local import 'filesystemErrorCode', was 'filesystemErrorCode' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { Error: Error$1 } = error;
Error$1._isHostProvided = true;

if (Error$1=== undefined) {
  const err = new Error("unexpectedly undefined local import 'Error$1', was 'Error' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { InputStream,
  OutputStream } = streams;
InputStream._isHostProvided = true;

if (InputStream=== undefined) {
  const err = new Error("unexpectedly undefined local import 'InputStream', was 'InputStream' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

OutputStream._isHostProvided = true;

if (OutputStream=== undefined) {
  const err = new Error("unexpectedly undefined local import 'OutputStream', was 'OutputStream' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}

const { getRandomBytes } = random;
getRandomBytes._isHostProvided = true;

if (getRandomBytes=== undefined) {
  const err = new Error("unexpectedly undefined local import 'getRandomBytes', was 'getRandomBytes' available at instantiation?");
  console.error("ERROR:", err.toString());
  throw err;
}


function promiseWithResolvers() {
  if (Promise.withResolvers) {
    return Promise.withResolvers();
  } else {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
}

const _debugLog = (...args) => {
  if (!globalThis?.process?.env?.JCO_DEBUG) { return; }
  console.debug(...args);
};
const ASYNC_DETERMINISM = 'random';
const GLOBAL_COMPONENT_MEMORY_MAP = new Map();
const CURRENT_TASK_META = {};

function _getGlobalCurrentTaskMeta(componentIdx) {
  const v = CURRENT_TASK_META[componentIdx];
  if (v === undefined) { return v; }
  return { ...v };
}

function _setGlobalCurrentTaskMeta(args) {
  if (!args) { throw new TypeError('args missing'); }
  if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
  if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
  const { taskID, componentIdx } = args;
  return CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
}

function _withGlobalCurrentTaskMeta(args) {
  _debugLog('[_withGlobalCurrentTaskMeta()] args', args);
  if (!args) { throw new TypeError('args missing'); }
  if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
  if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
  if (!args.fn) { throw new TypeError('missing fn'); }
  const { taskID, componentIdx, fn } = args;
  
  try {
    CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
    return fn();
  } catch (err) {
    _debugLog("error while executing sync callee/callback", {
      ...args,
      err,
    });
    throw err;
  } finally {
    CURRENT_TASK_META[componentIdx] = null;
  }
}

async function _withGlobalCurrentTaskMetaAsync(args) {
  _debugLog('[_withGlobalCurrentTaskMetaAsync()] args', args);
  if (!args) { throw new TypeError('args missing'); }
  if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
  if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
  if (!args.fn) { throw new TypeError('missing fn'); }
  const { taskID, componentIdx, fn } = args;
  
  // If there is already an async task executing, we must wait for it
  // to complete before we can can run the closure we were given
  //
  let current = CURRENT_TASK_META[componentIdx];
  let cstate;
  if (current && current.taskID !== taskID) {
    cstate = getOrCreateAsyncState(componentIdx);
    while (current && current.taskID !== taskID) {
      const { promise, resolve } = Promise.withResolvers();
      cstate.onNextExclusiveRelease(resolve);
      await promise;
      current = CURRENT_TASK_META[componentIdx];
    }
    
    // Since we've just waited for the component to not be locked, re-lock
    // exclusivity so we can run the fn below (likely a callee/callback)
    cstate.exclusiveLock();
  }
  
  try {
    CURRENT_TASK_META[componentIdx] = { taskID, componentIdx };
    return await fn();
  } catch (err) {
    _debugLog("error while executing async callee/callback", {
      ...args,
      err,
    });
    throw err;
  } finally {
    CURRENT_TASK_META[componentIdx] = null;
  }
}

async function _clearCurrentTask(args) {
  _debugLog('[_clearCurrentTask()] args', args);
  if (!args) { throw new TypeError('args missing'); }
  if (args.taskID === undefined) { throw new TypeError('missing task ID'); }
  if (args.componentIdx === undefined) { throw new TypeError('missing component idx'); }
  const { taskID, componentIdx } = args;
  
  const meta = CURRENT_TASK_META[componentIdx];
  if (!meta) { throw new Error(`missing current task meta for component idx [${componentIdx}]`); }
  
  if (meta.taskID !== taskID) {
    throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
  }
  if (meta.componentIdx !== componentIdx) {
    throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
  }
  
  CURRENT_TASK_META[componentIdx] = null;
}

function lookupMemoriesForComponent(args) {
  const { componentIdx } = args ?? {};
  if (args.componentIdx === undefined) { throw new TypeError("missing component idx"); }
  
  const metas = GLOBAL_COMPONENT_MEMORY_MAP.get(componentIdx);
  if (!metas) { return []; }
  
  if (args.memoryIdx === undefined) {
    return Object.values(metas);
  }
  
  const meta = metas[args.memoryIdx];
  return meta?.memory;
}

function registerGlobalMemoryForComponent(args) {
  const { componentIdx, memory, memoryIdx } = args ?? {};
  if (componentIdx === undefined) { throw new TypeError('missing component idx'); }
  if (memory === undefined && memoryIdx === undefined) { throw new TypeError('missing both memory & memory idx'); }
  let inner = GLOBAL_COMPONENT_MEMORY_MAP.get(componentIdx);
  if (!inner) {
    inner = {};
    GLOBAL_COMPONENT_MEMORY_MAP.set(componentIdx, inner);
  }
  
  inner[memoryIdx] = { memory, memoryIdx, componentIdx };
}

class RepTable {
  #data = [0, null];
  #target;
  
  constructor(args) {
    this.target = args?.target;
  }
  
  data() { return this.#data; }
  
  insert(val) {
    _debugLog('[RepTable#insert()] args', { val, target: this.target });
    const freeIdx = this.#data[0];
    if (freeIdx === 0) {
      this.#data.push(val);
      this.#data.push(null);
      const rep = (this.#data.length >> 1) - 1;
      _debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep });
      return rep;
    }
    this.#data[0] = this.#data[freeIdx << 1];
    const placementIdx = freeIdx << 1;
    this.#data[placementIdx] = val;
    this.#data[placementIdx + 1] = null;
    _debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep: freeIdx });
    return freeIdx;
  }
  
  get(rep) {
    _debugLog('[RepTable#get()] args', { rep, target: this.target });
    if (rep === 0) { throw new Error('invalid resource rep during get, (cannot be 0)'); }
    
    const baseIdx = rep << 1;
    const val = this.#data[baseIdx];
    return val;
  }
  
  contains(rep) {
    _debugLog('[RepTable#contains()] args', { rep, target: this.target });
    if (rep === 0) { throw new Error('invalid resource rep during contains, (cannot be 0)'); }
    
    const baseIdx = rep << 1;
    return !!this.#data[baseIdx];
  }
  
  remove(rep) {
    _debugLog('[RepTable#remove()] args', { rep, target: this.target });
    if (rep === 0) { throw new Error('invalid resource rep during remove, (cannot be 0)'); }
    if (this.#data.length === 2) { throw new Error('invalid'); }
    
    const baseIdx = rep << 1;
    const val = this.#data[baseIdx];
    
    this.#data[baseIdx] = this.#data[0];
    this.#data[0] = rep;
    
    return val;
  }
  
  clear() {
    _debugLog('[RepTable#clear()] args', { rep, target: this.target });
    this.#data = [0, null];
  }
}
const _coinFlip = () => { return Math.random() > 0.5; };
let SCOPE_ID = 0;
const I32_MIN = -2_147_483_648;
const I32_MAX = 2_147_483_647;
const _typeCheckValidI32 = (n) => typeof n === 'number' && n >= I32_MIN && n <= I32_MAX;

const _typeCheckAsyncFn= (f) => {
  return f instanceof ASYNC_FN_CTOR;
};

const ASYNC_FN_CTOR = (async () => {}).constructor;

function clearCurrentTask(componentIdx, taskID) {
  _debugLog('[clearCurrentTask()] args', { componentIdx, taskID });
  
  if (componentIdx === undefined || componentIdx === null) {
    throw new Error('missing/invalid component instance index while ending current task');
  }
  
  const tasks = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
  if (!tasks || !Array.isArray(tasks)) {
    throw new Error('missing/invalid tasks for component instance while ending task');
  }
  if (tasks.length == 0) {
    throw new Error(`no current tasks for component instance [${componentIdx}] while ending task`);
  }
  
  if (taskID !== undefined) {
    const last = tasks[tasks.length - 1];
    if (last.id !== taskID) {
      // throw new Error('current task does not match expected task ID');
      return;
    }
  }
  
  ASYNC_CURRENT_TASK_IDS.pop();
  ASYNC_CURRENT_COMPONENT_IDXS.pop();
  
  const taskMeta = tasks.pop();
  return taskMeta.task;
}
const CURRENT_TASK_MAY_BLOCK = new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
const ASYNC_CURRENT_TASK_IDS = [];
const ASYNC_CURRENT_COMPONENT_IDXS = [];

function unpackCallbackResult(result) {
  if (!(_typeCheckValidI32(result))) { throw new Error('invalid callback return value [' + result + '], not a valid i32'); }
  const eventCode = result & 0xF;
  if (eventCode < 0 || eventCode > 3) {
    throw new Error('invalid async return value [' + eventCode + '], outside callback code range');
  }
  if (result < 0 || result >= 2**32) { throw new Error('invalid callback result'); }
  // TODO: table max length check?
  const waitableSetRep = result >> 4;
  return [eventCode, waitableSetRep];
}

class AsyncSubtask {
  static _ID = 0n;
  
  static State = {
    STARTING: 0,
    STARTED: 1,
    RETURNED: 2,
    CANCELLED_BEFORE_STARTED: 3,
    CANCELLED_BEFORE_RETURNED: 4,
  };
  
  #id;
  #state = AsyncSubtask.State.STARTING;
  #componentIdx;
  
  #parentTask;
  #childTask = null;
  
  #dropped = false;
  #cancelRequested = false;
  
  #memoryIdx = null;
  #lenders = null;
  
  #waitable = null;
  
  #callbackFn = null;
  #callbackFnName = null;
  
  #postReturnFn = null;
  #onProgressFn = null;
  #pendingEventFn = null;
  
  #callMetadata = {};
  
  #resolved = false;
  
  #onResolveHandlers = [];
  #onStartHandlers = [];
  
  #result = null;
  #resultSet = false;
  
  fnName;
  target;
  isAsync;
  isManualAsync;
  
  constructor(args) {
    if (typeof args.componentIdx !== 'number') {
      throw new Error('invalid componentIdx for subtask creation');
    }
    this.#componentIdx = args.componentIdx;
    
    this.#id = ++AsyncSubtask._ID;
    this.fnName = args.fnName;
    
    if (!args.parentTask) { throw new Error('missing parent task during subtask creation'); }
    this.#parentTask = args.parentTask;
    
    if (args.childTask) { this.#childTask = args.childTask; }
    
    if (args.memoryIdx) { this.#memoryIdx = args.memoryIdx; }
    
    if (!args.waitable) { throw new Error("missing/invalid waitable"); }
    this.#waitable = args.waitable;
    
    if (args.callMetadata) { this.#callMetadata = args.callMetadata; }
    
    this.#lenders = [];
    this.target = args.target;
    this.isAsync = args.isAsync;
    this.isManualAsync = args.isManualAsync;
  }
  
  id() { return this.#id; }
  parentTaskID() { return this.#parentTask?.id(); }
  childTaskID() { return this.#childTask?.id(); }
  state() { return this.#state; }
  
  waitable() { return this.#waitable; }
  waitableRep() { return this.#waitable.idx(); }
  
  join() { return this.#waitable.join(...arguments); }
  getPendingEvent() { return this.#waitable.getPendingEvent(...arguments); }
  hasPendingEvent() { return this.#waitable.hasPendingEvent(...arguments); }
  setPendingEvent() { return this.#waitable.setPendingEvent(...arguments); }
  
  setTarget(tgt) { this.target = tgt; }
  
  getResult() {
    if (!this.#resultSet) { throw new Error("subtask result has not been set") }
    return this.#result;
  }
  setResult(v) {
    if (this.#resultSet) { throw new Error("subtask result has already been set"); }
    this.#result = v;
    this.#resultSet = true;
  }
  
  componentIdx() { return this.#componentIdx; }
  
  setChildTask(t) {
    if (!t) { throw new Error('cannot set missing/invalid child task on subtask'); }
    if (this.#childTask) { throw new Error('child task is already set on subtask'); }
    if (this.#parentTask === t) { throw new Error("parent cannot be child"); }
    this.#childTask = t;
  }
  getChildTask(t) { return this.#childTask; }
  
  getParentTask() { return this.#parentTask; }
  
  setCallbackFn(f, name) {
    if (!f) { return; }
    if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
    this.#callbackFn = f;
    this.#callbackFnName = name;
  }
  
  getCallbackFnName() {
    if (!this.#callbackFn) { return undefined; }
    return this.#callbackFn.name;
  }
  
  setPostReturnFn(f) {
    if (!f) { return; }
    if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
    this.#postReturnFn = f;
  }
  
  setOnProgressFn(f) {
    if (this.#onProgressFn) { throw new Error('on progress fn can only be set once'); }
    this.#onProgressFn = f;
  }
  
  isNotStarted() {
    return this.#state == AsyncSubtask.State.STARTING;
  }
  
  registerOnStartHandler(f) {
    this.#onStartHandlers.push(f);
  }
  
  onStart(args) {
    _debugLog('[AsyncSubtask#onStart()] args', {
      componentIdx: this.#componentIdx,
      subtaskID: this.#id,
      parentTaskID: this.parentTaskID(),
      fnName: this.fnName,
    });
    
    if (this.#onProgressFn) { this.#onProgressFn(); }
    
    this.#state = AsyncSubtask.State.STARTED;
    
    let result;
    
    // If we have been provided a helper start function as a result of
    // component fusion performed by wasmtime tooling, then we can call that helper and lifts/lowers will
    // be performed for us.
    //
    // See also documentation on `HostIntrinsic::PrepareCall`
    //
    if (this.#callMetadata.startFn) {
      result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
    }
    
    return result;
  }
  
  
  registerOnResolveHandler(f) {
    this.#onResolveHandlers.push(f);
  }
  
  reject(subtaskErr) {
    this.#childTask?.reject(subtaskErr);
  }
  
  onResolve(subtaskValue) {
    _debugLog('[AsyncSubtask#onResolve()] args', {
      componentIdx: this.#componentIdx,
      subtaskID: this.#id,
      isAsync: this.isAsync,
      childTaskID: this.childTaskID(),
      parentTaskID: this.parentTaskID(),
      parentTaskFnName: this.#parentTask?.entryFnName(),
      fnName: this.fnName,
    });
    
    if (this.#resolved) {
      throw new Error('subtask has already been resolved');
    }
    
    if (this.#onProgressFn) { this.#onProgressFn(); }
    
    if (subtaskValue === null) {
      if (this.#cancelRequested) {
        throw new Error('cancel was not requested, but no value present at return');
      }
      
      if (this.#state === AsyncSubtask.State.STARTING) {
        this.#state = AsyncSubtask.State.CANCELLED_BEFORE_STARTED;
      } else {
        if (this.#state !== AsyncSubtask.State.STARTED) {
          throw new Error('resolved subtask must have been started before cancellation');
        }
        this.#state = AsyncSubtask.State.CANCELLED_BEFORE_RETURNED;
      }
    } else {
      if (this.#state !== AsyncSubtask.State.STARTED) {
        throw new Error('resolved subtask must have been started before completion');
      }
      this.#state = AsyncSubtask.State.RETURNED;
    }
    
    this.setResult(subtaskValue);
    
    for (const f of this.#onResolveHandlers) {
      try {
        f(subtaskValue);
      } catch (err) {
        console.error("error during subtask resolve handler", err);
        throw err;
      }
    }
    
    const callMetadata = this.getCallMetadata();
    
    // TODO(fix): we should be able to easily have the caller's meomry
    // to lower into here, but it's not present in PrepareCall
    const memory = callMetadata.memory ?? this.#parentTask?.getReturnMemory() ?? lookupMemoriesForComponent({ componentIdx: this.#parentTask?.componentIdx() })[0];
    if (callMetadata && !callMetadata.returnFn && this.isAsync && callMetadata.resultPtr && memory) {
      const { resultPtr, realloc } = callMetadata;
      const lowers = callMetadata.lowers; // may have been updated in task.return of the child
      if (lowers && lowers.length > 0) {
        lowers[0]({
          componentIdx: this.#componentIdx,
          memory,
          realloc,
          vals: [subtaskValue],
          storagePtr: resultPtr,
        });
      }
    }
    
    this.#resolved = true;
    this.#parentTask.removeSubtask(this);
  }
  
  getStateNumber() { return this.#state; }
  isReturned() { return this.#state === AsyncSubtask.State.RETURNED; }
  
  getCallMetadata() { return this.#callMetadata; }
  
  isResolved() {
    if (this.#state === AsyncSubtask.State.STARTING
    || this.#state === AsyncSubtask.State.STARTED) {
      return false;
    }
    if (this.#state === AsyncSubtask.State.RETURNED
    || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_STARTED
    || this.#state === AsyncSubtask.State.CANCELLED_BEFORE_RETURNED) {
      return true;
    }
    throw new Error('unrecognized internal Subtask state [' + this.#state + ']');
  }
  
  addLender(handle) {
    _debugLog('[AsyncSubtask#addLender()] args', { handle });
    if (!Number.isNumber(handle)) { throw new Error('missing/invalid lender handle [' + handle + ']'); }
    
    if (this.#lenders.length === 0 || this.isResolved()) {
      throw new Error('subtask has no lendors or has already been resolved');
    }
    
    handle.lends++;
    this.#lenders.push(handle);
  }
  
  deliverResolve() {
    _debugLog('[AsyncSubtask#deliverResolve()] args', {
      lenders: this.#lenders,
      parentTaskID: this.parentTaskID(),
      subtaskID: this.#id,
      childTaskID: this.childTaskID(),
      resolved: this.isResolved(),
      resolveDelivered: this.resolveDelivered(),
    });
    
    const cannotDeliverResolve = this.resolveDelivered() || !this.isResolved();
    if (cannotDeliverResolve) {
      throw new Error('subtask cannot deliver resolution twice, and the subtask must be resolved');
    }
    
    for (const lender of this.#lenders) {
      lender.lends--;
    }
    
    this.#lenders = null;
  }
  
  resolveDelivered() {
    _debugLog('[AsyncSubtask#resolveDelivered()] args', { });
    if (this.#lenders === null && !this.isResolved()) {
      throw new Error('invalid subtask state, lenders missing and subtask has not been resolved');
    }
    return this.#lenders === null;
  }
  
  drop() {
    _debugLog('[AsyncSubtask#drop()] args', {
      componentIdx: this.#componentIdx,
      parentTaskID: this.#parentTask?.id(),
      parentTaskFnName: this.#parentTask?.entryFnName(),
      childTaskID: this.#childTask?.id(),
      childTaskFnName: this.#childTask?.entryFnName(),
      subtaskFnName: this.fnName,
    });
    if (!this.#waitable) { throw new Error('missing/invalid inner waitable'); }
    if (!this.resolveDelivered()) {
      throw new Error('cannot drop subtask before resolve is delivered');
    }
    if (this.#waitable) { this.#waitable.drop() }
    this.#dropped = true;
  }
  
  #getComponentState() {
    const state = getOrCreateAsyncState(this.#componentIdx);
    if (!state) {
      throw new Error('invalid/missing async state for component [' + componentIdx + ']');
    }
    return state;
  }
  
  getWaitableHandleIdx() {
    _debugLog('[AsyncSubtask#getWaitableHandleIdx()] args', { });
    if (!this.#waitable) { throw new Error('missing/invalid waitable'); }
    return this.waitableRep();
  }
}

function _prepareCall(
memoryIdx,
getMemoryFn,
startFn,
returnFn,
callerComponentIdx,
calleeComponentIdx,
taskReturnTypeIdx,
calleeIsAsyncInt,
stringEncoding,
resultCountOrAsync,
) {
  _debugLog('[_prepareCall()]', {
    memoryIdx,
    callerComponentIdx,
    calleeComponentIdx,
    taskReturnTypeIdx,
    calleeIsAsyncInt,
    stringEncoding,
    resultCountOrAsync,
  });
  const argArray = [...arguments];
  
  // value passed in *may* be as large as u32::MAX which may be mangled into -2
  resultCountOrAsync >>>= 0;
  
  let isAsync = false;
  let hasResultPointer = false;
  if (resultCountOrAsync === 2**32 - 1) {
    // prepare async with no result (u32::MAX)
    isAsync = true;
    hasResultPointer = false;
  } else if (resultCountOrAsync === 2**32 - 2) {
    // prepare async with result (u32::MAX - 1)
    isAsync = true;
    hasResultPointer = true;
  }
  
  const currentCallerTaskMeta = getCurrentTask(callerComponentIdx);
  if (!currentCallerTaskMeta) {
    throw new Error('invalid/missing current task for caller during prepare call');
  }
  
  const currentCallerTask = currentCallerTaskMeta.task;
  if (!currentCallerTask) {
    throw new Error('unexpectedly missing task in meta for caller during prepare call');
  }
  
  if (currentCallerTask.componentIdx() !== callerComponentIdx) {
    throw new Error(`task component idx [${ currentCallerTask.componentIdx() }] !== [${ callerComponentIdx }] (callee ${ calleeComponentIdx })`);
  }
  
  let getCalleeParamsFn;
  let resultPtr = null;
  let directParamsArr;
  if (hasResultPointer) {
    directParamsArr = argArray.slice(10, argArray.length - 1);
    getCalleeParamsFn = () => directParamsArr;
    resultPtr = argArray[argArray.length - 1];
  } else {
    directParamsArr = argArray.slice(10);
    getCalleeParamsFn = () => directParamsArr;
  }
  
  let encoding;
  switch (stringEncoding) {
    case 0:
    encoding = 'utf8';
    break;
    case 1:
    encoding = 'utf16';
    break;
    case 2:
    encoding = 'compact-utf16';
    break;
    default:
    throw new Error(`unrecognized string encoding enum [${stringEncoding}]`);
  }
  
  const subtask = currentCallerTask.createSubtask({
    componentIdx: callerComponentIdx,
    parentTask: currentCallerTask,
    isAsync,
    callMetadata: {
      getMemoryFn,
      memoryIdx,
      resultPtr,
      returnFn,
      startFn,
    }
  });
  
  const [newTask, newTaskID] = createNewCurrentTask({
    componentIdx: calleeComponentIdx,
    isAsync,
    getCalleeParamsFn,
    entryFnName: [
    'task',
    subtask.getParentTask().id(),
    'subtask',
    subtask.id(),
    'new-prepared-async-task'
    ].join('/'),
    stringEncoding,
  });
  newTask.setParentSubtask(subtask);
  newTask.setReturnMemoryIdx(memoryIdx);
  newTask.setReturnMemory(getMemoryFn);
  subtask.setChildTask(newTask);
  
  newTask.subtaskMeta = {
    subtask,
    calleeComponentIdx,
    callerComponentIdx,
    getCalleeParamsFn,
    stringEncoding,
    isAsync,
  };
  
  _setGlobalCurrentTaskMeta({
    taskID: newTask.id(),
    componentIdx: newTask.componentIdx(),
  });
}

function _asyncStartCall(args, callee, paramCount, resultCount, flags) {
  const componentIdx = ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
  
  const globalTaskMeta = _getGlobalCurrentTaskMeta(componentIdx);
  if (!globalTaskMeta) { throw new Error('missing global current task globalTaskMeta'); }
  const taskID = globalTaskMeta.taskID;
  
  _debugLog('[_asyncStartCall()] args', { args, componentIdx });
  const { getCallbackFn, callbackIdx, getPostReturnFn, postReturnIdx } = args;
  
  const preparedTaskMeta = getCurrentTask(componentIdx, taskID);
  if (!preparedTaskMeta) { throw new Error('unexpectedly missing current task'); }
  
  const preparedTask = preparedTaskMeta.task;
  if (!preparedTask) { throw new Error('unexpectedly missing current task'); }
  if (!preparedTask.subtaskMeta) { throw new Error('missing subtask meta from prepare'); }
  
  const {
    subtask,
    returnMemoryIdx,
    getReturnMemoryFn,
    callerComponentIdx,
    calleeComponentIdx,
    getCalleeParamsFn,
    isAsync,
    stringEncoding,
  } = preparedTask.subtaskMeta;
  if (!subtask) { throw new Error("missing subtask from cstate during async start call"); }
  if (calleeComponentIdx !== preparedTask.componentIdx()) {
    throw new Error(`meta callee idx [${calleeComponentIdx}] != current task idx [${preparedTask.componentIdx()}] during async start call`);
  }
  if (calleeComponentIdx !== componentIdx) {
    throw new Error("mismatched componentIdx for async start call (does not match prepare)");
  }
  
  const argArray = [...arguments];
  
  if (resultCount < 0 || resultCount > 1) { throw new Error('invalid/unsupported result count'); }
  
  const callbackFnName = 'callback_' + callbackIdx;
  const callbackFn = getCallbackFn();
  preparedTask.setCallbackFn(callbackFn, callbackFnName);
  preparedTask.setPostReturnFn(getPostReturnFn());
  
  if (resultCount < 0 || resultCount > 1) {
    throw new Error(`unsupported result count [${ resultCount }]`);
  }
  
  const params = preparedTask.getCalleeParams();
  if (paramCount !== params.length) {
    throw new Error(`unexpected callee param count [${ params.length }], _asyncStartCall invocation expected [${ paramCount }]`);
  }
  
  const callerComponentState = getOrCreateAsyncState(subtask.componentIdx());
  
  const calleeComponentState = getOrCreateAsyncState(preparedTask.componentIdx());
  const calleeBackpressure = calleeComponentState.hasBackpressure();
  
  // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
  //
  // NOTE: during fused guest->guest calls this handler is triggered, but does not actually perform
  // lowering manually, as fused modules provider helper functions that can
  subtask.registerOnResolveHandler((res) => {
    _debugLog('[_asyncStartCall()] handling subtask result', { res, subtaskID: subtask.id() });
    
    let subtaskCallMeta = subtask.getCallMetadata();
    
    // NOTE: in the case of guest -> guest async calls, there may be no memory/realloc present,
    // as the host will intermediate the value storage/movement between calls.
    //
    // We can simply take the value and lower it as a parameter
    if (subtaskCallMeta.memory || subtaskCallMeta.realloc) {
      throw new Error("call metadata unexpectedly contains memory/realloc for guest->guest call");
    }
    
    const callerTask = subtask.getParentTask();
    const calleeTask = preparedTask;
    const callerMemoryIdx = callerTask.getReturnMemoryIdx();
    const callerComponentIdx = callerTask.componentIdx();
    
    // If a helper function was provided we are likely in a fused guest->guest call,
    // and the result will be delivered (lift/lowered) via helper function
    if (subtaskCallMeta && subtaskCallMeta.returnFn) {
      _debugLog('[_asyncStartCall()] return function present while handling subtask result, returning early (skipping lower)');
      
      // TODO: centralize calling of returnFn to *one place* (if possible)
      if (subtaskCallMeta.returnFnCalled) { return; }
      
      subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]);
      return;
    }
    
    // If there is no where to lower the results, exit early
    if (!subtaskCallMeta.resultPtr) {
      _debugLog('[_asyncStartCall()] no result ptr during subtask result handling, returning early (skipping lower)');
      return;
    }
    
    let callerMemory;
    if (callerMemoryIdx !== null && callerMemoryIdx !== undefined) {
      callerMemory = lookupMemoriesForComponent({ componentIdx: callerComponentIdx, memoryIdx: callerMemoryIdx });
    } else {
      const callerMemories = lookupMemoriesForComponent({ componentIdx: callerComponentIdx });
      if (callerMemories.length !== 1) { throw new Error(`unsupported amount of caller memories`); }
      callerMemory = callerMemories[0];
    }
    
    if (!callerMemory) {
      _debugLog('[_asyncStartCall()] missing memory', { subtaskID: subtask.id(), res });
      throw new Error(`missing memory for to guest->guest call result (subtask [${subtask.id()}])`);
    }
    
    const lowerFns = calleeTask.getReturnLowerFns();
    if (!lowerFns || lowerFns.length === 0) {
      _debugLog('[_asyncStartCall()] missing result lower metadata for guest->guest call', { subtaskID: subtask.id() });
      throw new Error(`missing result lower metadata for guest->guest call (subtask [${subtask.id()}])`);
    }
    
    if (lowerFns.length !== 1) {
      _debugLog('[_asyncStartCall()] only single result reportetd for guest->guest call', { subtaskID: subtask.id() });
      throw new Error(`only single result supported for guest->guest calls (subtask [${subtask.id()}])`);
    }
    
    _debugLog('[_asyncStartCall()] lowering results', { subtaskID: subtask.id() });
    lowerFns[0]({
      realloc: undefined,
      memory: callerMemory,
      vals: [res],
      storagePtr: subtaskCallMeta.resultPtr,
      componentIdx: callerComponentIdx
    });
    
  });
  
  subtask.setOnProgressFn(() => {
    subtask.setPendingEvent(() => {
      if (subtask.isResolved()) { subtask.deliverResolve(); }
      const event = {
        code: ASYNC_EVENT_CODE.SUBTASK,
        payload0: subtask.waitableRep(),
        payload1: subtask.getStateNumber(),
      };
      return event;
    });
  });
  
  // Start the (event) driver loop that will resolve the task
  queueMicrotask(async () => {
    let startRes = subtask.onStart({ startFnParams: params });
    startRes = Array.isArray(startRes) ? startRes : [startRes];
    
    await calleeComponentState.suspendTask({
      task: preparedTask,
      readyFn: () => !calleeComponentState.isExclusivelyLocked(),
    });
    
    const started = await preparedTask.enter();
    if (!started) {
      _debugLog('[_asyncStartCall()] task failed early', {
        taskID: preparedTask.id(),
        subtaskID: subtask.id(),
      });
      throw new Error("task failed to start");
      return;
    }
    
    let callbackResult;
    try {
      let jspiCallee = WebAssembly.promising(callee);
      callbackResult = await _withGlobalCurrentTaskMetaAsync({
        taskID: preparedTask.id(),
        componentIdx: preparedTask.componentIdx(),
        fn: () => {
          return jspiCallee.apply(null, startRes);
        }
      });
    } catch(err) {
      _debugLog("[_asyncStartCall()] initial subtask callee run failed", err);
      // NOTE: a good place to rejectt the parent task, if rejection API is enabled
      // subtask.reject(err);
      // subtask.getParentTask().reject(err);
      
      subtask.getParentTask().setErrored(err);
      
      return;
    }
    
    // If there was no callback function, we're dealing with a sync function
    // that was lifted as async without one, there is only the callee.
    if (!callbackFn) {
      _debugLog("[_asyncStartCall()] no callback, resolving w/ callee result", {
        taskID: preparedTask.id(),
        componentIdx: preparedTask.componentIdx(),
        preparedTask,
        stateNumber: preparedTask.taskState(),
        isResolved: preparedTask.isResolved(),
        callbackFn,
      });
      preparedTask.resolve([callbackResult]);
      return;
    }
    
    let fnName = callbackFn.fnName;
    if (!fnName) {
      fnName = [
      '<task ',
      subtask.parentTaskID(),
      '/subtask ',
      subtask.id(),
      '/task ',
      preparedTask.id(),
      '>',
      ].join("");
    }
    
    try {
      _debugLog("[_asyncStartCall()] starting driver loop", {
        fnName,
        componentIdx: preparedTask.componentIdx(),
        subtaskID: subtask.id(),
        childTaskID: subtask.childTaskID(),
        parentTaskID: subtask.parentTaskID(),
      });
      
      await _driverLoop({
        componentState: calleeComponentState,
        task: preparedTask,
        fnName,
        isAsync: true,
        callbackResult,
        resolve,
        reject
      });
    } catch (err) {
      _debugLog("[AsyncStartCall] drive loop call failure", { err });
    }
    
  });
  
  const subtaskState = subtask.getStateNumber();
  if (subtaskState < 0 || subtaskState > 2**5) {
    throw new Error('invalid subtask state, out of valid range');
  }
  
  _debugLog('[_asyncStartCall()] returning subtask rep & state', {
    subtask: {
      rep: subtask.waitableRep(),
      state: subtaskState,
    }
  });
  
  return Number(subtask.waitableRep()) << 4 | subtaskState;
}

function _syncStartCall(callbackIdx) {
  _debugLog('[_syncStartCall()] args', { callbackIdx });
  throw new Error('synchronous start call not implemented!');
}

class Waitable {
  #componentIdx;
  
  #pendingEventFn = null;
  
  #promise;
  #resolve;
  #reject;
  
  #waitableSet = null;
  
  #idx = null; // to component-global waitables
  
  target;
  
  constructor(args) {
    const { componentIdx, target } = args;
    this.#componentIdx = componentIdx;
    this.target = args.target;
    this.#resetPromise();
  }
  
  componentIdx() { return this.#componentIdx; }
  isInSet() { return this.#waitableSet !== null; }
  
  idx() { return this.#idx; }
  setIdx(idx) {
    if (idx === 0) { throw new Error("waitable idx cannot be zero"); }
    this.#idx = idx;
  }
  
  setTarget(tgt) { this.target = tgt; }
  
  #resetPromise() {
    const { promise, resolve, reject } = promiseWithResolvers()
    this.#promise = promise;
    this.#resolve = resolve;
    this.#reject = reject;
  }
  
  resolve() { this.#resolve(); }
  reject(err) { this.#reject(err); }
  promise() { return this.#promise; }
  
  hasPendingEvent() {
    // _debugLog('[Waitable#hasPendingEvent()]', {
      //     componentIdx: this.#componentIdx,
      //     waitable: this,
      //     waitableSet: this.#waitableSet,
      //     hasPendingEvent: this.#pendingEventFn !== null,
      // });
      return this.#pendingEventFn !== null;
    }
    
    setPendingEvent(fn) {
      _debugLog('[Waitable#setPendingEvent()] args', {
        waitable: this,
        inSet: this.#waitableSet,
      });
      this.#pendingEventFn = fn;
    }
    
    getPendingEvent() {
      _debugLog('[Waitable#getPendingEvent()] args', {
        waitable: this,
        inSet: this.#waitableSet,
        hasPendingEvent: this.#pendingEventFn !== null,
      });
      if (this.#pendingEventFn === null) { return null; }
      const eventFn = this.#pendingEventFn;
      this.#pendingEventFn = null;
      const e = eventFn();
      this.#resetPromise();
      return e;
    }
    
    join(waitableSet) {
      _debugLog('[Waitable#join()] args', {
        waitable: this,
        waitableSet: waitableSet,
      });
      if (this.#waitableSet) { this.#waitableSet.removeWaitable(this); }
      if (!waitableSet) {
        this.#waitableSet = null;
        return;
      }
      waitableSet.addWaitable(this);
      this.#waitableSet = waitableSet;
    }
    
    drop() {
      _debugLog('[Waitable#drop()] args', {
        componentIdx: this.#componentIdx,
        waitable: this,
      });
      if (this.hasPendingEvent()) {
        throw new Error('waitables with pending events cannot be dropped');
      }
      this.join(null);
    }
    
  }
  
  const ERR_CTX_TABLES = {};
  
  let dv = new DataView(new ArrayBuffer());
  const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
  
  const toUint64 = val => BigInt.asUintN(64, BigInt(val));
  
  function toUint32(val) {
    return val >>> 0;
  }
  const TEXT_DECODER_UTF8 = new TextDecoder();
  const TEXT_ENCODER_UTF8 = new TextEncoder();
  
  function _utf8AllocateAndEncode(s, realloc, memory) {
    if (typeof s !== 'string') {
      throw new TypeError('expected a string, received [' + typeof s + ']');
    }
    if (s.length === 0) { return { ptr: 1, len: 0 }; }
    let buf = TEXT_ENCODER_UTF8.encode(s);
    let ptr = realloc(0, 0, 1, buf.length);
    new Uint8Array(memory.buffer).set(buf, ptr);
    const res = { ptr, len: buf.length, codepoints: [...s].length };
    return res;
  }
  
  
  const T_FLAG = 1 << 30;
  
  function rscTableCreateOwn(table, rep) {
    const free = table[0] & ~T_FLAG;
    if (free === 0) {
      table.push(0);
      table.push(rep | T_FLAG);
      return (table.length >> 1) - 1;
    }
    table[0] = table[free << 1];
    table[free << 1] = 0;
    table[(free << 1) + 1] = rep | T_FLAG;
    return free;
  }
  
  function rscTableRemove(table, handle) {
    const scope = table[handle << 1];
    const val = table[(handle << 1) + 1];
    const own = (val & T_FLAG) !== 0;
    const rep = val & ~T_FLAG;
    if (val === 0 || (scope & T_FLAG) !== 0) {
      throw new TypeError("Invalid handle");
    }
    table[handle << 1] = table[0] | T_FLAG;
    table[0] = handle | T_FLAG;
    return { rep, scope, own };
  }
  
  let curResourceBorrows = [];
  
  function getCurrentTask(componentIdx, taskID) {
    let usedGlobal = false;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing component idx'); // TODO(fix)
      // componentIdx = ASYNC_CURRENT_COMPONENT_IDXS.at(-1);
      // usedGlobal = true;
    }
    
    const taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    if (taskMetas === undefined || taskMetas.length === 0) { return undefined; }
    
    if (taskID) {
      return taskMetas.find(meta => meta.task.id() === taskID);
    }
    
    const taskMeta = taskMetas[taskMetas.length - 1];
    if (!taskMeta || !taskMeta.task) { return undefined; }
    
    return taskMeta;
  }
  
  function createNewCurrentTask(args) {
    _debugLog('[createNewCurrentTask()] args', args);
    const {
      componentIdx,
      isAsync,
      isManualAsync,
      entryFnName,
      parentSubtaskID,
      callbackFnName,
      getCallbackFn,
      getParamsFn,
      stringEncoding,
      errHandling,
      getCalleeParamsFn,
      resultPtr,
      callingWasmExport,
    } = args;
    if (componentIdx === undefined || componentIdx === null) {
      throw new Error('missing/invalid component instance index while starting task');
    }
    let taskMetas = ASYNC_TASKS_BY_COMPONENT_IDX.get(componentIdx);
    const callbackFn = getCallbackFn ? getCallbackFn() : null;
    
    const newTask = new AsyncTask({
      componentIdx,
      isAsync,
      isManualAsync,
      entryFnName,
      callbackFn,
      callbackFnName,
      stringEncoding,
      getCalleeParamsFn,
      resultPtr,
      errHandling,
    });
    
    const newTaskID = newTask.id();
    const newTaskMeta = { id: newTaskID, componentIdx, task: newTask };
    
    // NOTE: do not track host tasks
    ASYNC_CURRENT_TASK_IDS.push(newTaskID);
    ASYNC_CURRENT_COMPONENT_IDXS.push(componentIdx);
    
    if (!taskMetas) {
      taskMetas = [newTaskMeta];
      ASYNC_TASKS_BY_COMPONENT_IDX.set(componentIdx, [newTaskMeta]);
    } else {
      taskMetas.push(newTaskMeta);
    }
    
    return [newTask, newTaskID];
  }
  const ASYNC_TASKS_BY_COMPONENT_IDX = new Map();
  
  class AsyncTask {
    static _ID = 0n;
    
    static State = {
      INITIAL: 'initial',
      CANCELLED: 'cancelled',
      CANCEL_PENDING: 'cancel-pending',
      CANCEL_DELIVERED: 'cancel-delivered',
      RESOLVED: 'resolved',
    }
    
    static BlockResult = {
      CANCELLED: 'block.cancelled',
      NOT_CANCELLED: 'block.not-cancelled',
    }
    
    #id;
    #componentIdx;
    #state;
    #isAsync;
    #isManualAsync;
    #entryFnName = null;
    
    #onResolveHandlers = [];
    #completionPromise = null;
    #rejected = false;
    
    #exitPromise = null;
    #onExitHandlers = [];
    
    #memoryIdx = null;
    #memory = null;
    
    #callbackFn = null;
    #callbackFnName = null;
    
    #postReturnFn = null;
    
    #getCalleeParamsFn = null;
    
    #stringEncoding = null;
    
    #parentSubtask = null;
    
    #needsExclusiveLock = false;
    
    #errHandling;
    
    #backpressurePromise;
    #backpressureWaiters = 0n;
    
    #returnLowerFns = null;
    
    #subtasks = [];
    
    #entered = false;
    #exited = false;
    #errored = null;
    
    cancelled = false;
    cancelRequested = false;
    alwaysTaskReturn = false;
    
    returnCalls =  0;
    storage = [0, 0];
    borrowedHandles = {};
    
    constructor(opts) {
      this.#id = ++AsyncTask._ID;
      
      if (opts?.componentIdx === undefined) {
        throw new TypeError('missing component id during task creation');
      }
      this.#componentIdx = opts.componentIdx;
      
      this.#state = AsyncTask.State.INITIAL;
      this.#isAsync = opts?.isAsync ?? false;
      this.#isManualAsync = opts?.isManualAsync ?? false;
      this.#entryFnName = opts.entryFnName;
      
      const {
        promise: completionPromise,
        resolve: resolveCompletionPromise,
        reject: rejectCompletionPromise,
      } = promiseWithResolvers();
      this.#completionPromise = completionPromise;
      
      this.#onResolveHandlers.push((results) => {
        if (this.#errored !== null) {
          rejectCompletionPromise(this.#errored);
          return;
        } else if (this.#rejected) {
          rejectCompletionPromise(results);
          return;
        }
        resolveCompletionPromise(results);
      });
      
      const {
        promise: exitPromise,
        resolve: resolveExitPromise,
        reject: rejectExitPromise,
      } = promiseWithResolvers();
      this.#exitPromise = exitPromise;
      
      this.#onExitHandlers.push(() => {
        resolveExitPromise();
      });
      
      if (opts.callbackFn) { this.#callbackFn = opts.callbackFn; }
      if (opts.callbackFnName) { this.#callbackFnName = opts.callbackFnName; }
      
      if (opts.getCalleeParamsFn) { this.#getCalleeParamsFn = opts.getCalleeParamsFn; }
      
      if (opts.stringEncoding) { this.#stringEncoding = opts.stringEncoding; }
      
      if (opts.parentSubtask) { this.#parentSubtask = opts.parentSubtask; }
      
      this.#needsExclusiveLock = this.isSync() || !this.hasCallback();
      
      if (opts.errHandling) { this.#errHandling = opts.errHandling; }
    }
    
    taskState() { return this.#state; }
    id() { return this.#id; }
    componentIdx() { return this.#componentIdx; }
    entryFnName() { return this.#entryFnName; }
    
    completionPromise() { return this.#completionPromise; }
    exitPromise() { return this.#exitPromise; }
    
    isAsync() { return this.#isAsync; }
    isSync() { return !this.isAsync(); }
    
    getErrHandling() { return this.#errHandling; }
    
    hasCallback() { return this.#callbackFn !== null; }
    
    getReturnMemoryIdx() { return this.#memoryIdx; }
    setReturnMemoryIdx(idx) {
      if (idx === null) { return; }
      this.#memoryIdx = idx;
    }
    
    getReturnMemory() { return this.#memory; }
    setReturnMemory(m) {
      if (m === null) { return; }
      this.#memory = m;
    }
    
    setReturnLowerFns(fns) { this.#returnLowerFns = fns; }
    getReturnLowerFns() { return this.#returnLowerFns; }
    
    setParentSubtask(subtask) {
      if (!subtask || !(subtask instanceof AsyncSubtask)) { return }
      if (this.#parentSubtask) { throw new Error('parent subtask can only be set once'); }
      this.#parentSubtask = subtask;
    }
    
    getParentSubtask() { return this.#parentSubtask; }
    
    // TODO(threads): this is very inefficient, we can pass along a root task,
    // and ideally do not need this once thread support is in place
    getRootTask() {
      let currentSubtask = this.getParentSubtask();
      let task = this;
      while (currentSubtask) {
        task = currentSubtask.getParentTask();
        currentSubtask = task.getParentSubtask();
      }
      return task;
    }
    
    setPostReturnFn(f) {
      if (!f) { return; }
      if (this.#postReturnFn) { throw new Error('postReturn fn can only be set once'); }
      this.#postReturnFn = f;
    }
    
    setCallbackFn(f, name) {
      if (!f) { return; }
      if (this.#callbackFn) { throw new Error('callback fn can only be set once'); }
      this.#callbackFn = f;
      this.#callbackFnName = name;
    }
    
    getCallbackFnName() {
      if (!this.#callbackFnName) { return undefined; }
      return this.#callbackFnName;
    }
    
    async runCallbackFn(...args) {
      if (!this.#callbackFn) { throw new Error('on callback function has been set for task'); }
      return await this.#callbackFn.apply(null, args);
    }
    
    getCalleeParams() {
      if (!this.#getCalleeParamsFn) { throw new Error('missing/invalid getCalleeParamsFn'); }
      return this.#getCalleeParamsFn();
    }
    
    mayBlock() { return this.isAsync() || this.isResolvedState() }
    
    mayEnter(task) {
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      if (cstate.hasBackpressure()) {
        _debugLog('[AsyncTask#mayEnter()] disallowed due to backpressure', { taskID: this.#id });
        return false;
      }
      if (!cstate.callingSyncImport()) {
        _debugLog('[AsyncTask#mayEnter()] disallowed due to sync import call', { taskID: this.#id });
        return false;
      }
      const callingSyncExportWithSyncPending = cstate.callingSyncExport && !task.isAsync;
      if (!callingSyncExportWithSyncPending) {
        _debugLog('[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending', { taskID: this.#id });
        return false;
      }
      return true;
    }
    
    enterSync() {
      if (this.needsExclusiveLock()) {
        const cstate = getOrCreateAsyncState(this.#componentIdx);
        cstate.exclusiveLock();
      }
      return true;
    }
    
    async enter(opts) {
      _debugLog('[AsyncTask#enter()] args', {
        taskID: this.#id,
        componentIdx: this.#componentIdx,
        subtaskID: this.getParentSubtask()?.id(),
      });
      
      if (this.#entered) {
        throw new Error(`task with ID [${this.#id}] should not be entered twice`);
      }
      
      const cstate = getOrCreateAsyncState(this.#componentIdx);
      
      // If a task is either synchronous or host-provided (e.g. a host import, whether sync or async)
      // then we can avoid component-relevant tracking and immediately enter
      if (this.isSync() || opts?.isHost) {
        this.#entered = true;
        
        // TODO(breaking): remove once manually-spccifying async fns is removed
        // It is currently possible for an actually sync export to be specified
        // as async via JSPI
        if (this.#isManualAsync) {
          if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
        }
        
        return this.#entered;
      }
      
      if (cstate.hasBackpressure()) {
        cstate.addBackpressureWaiter();
        
        const result = await this.waitUntil({
          readyFn: () => !cstate.hasBackpressure(),
          cancellable: true,
        });
        
        cstate.removeBackpressureWaiter();
        
        if (result === AsyncTask.BlockResult.CANCELLED) {
          this.cancel();
          return false;
        }
      }
      
      if (this.needsExclusiveLock()) { cstate.exclusiveLock(); }
      
      this.#entered = true;
      return this.#entered;
    }
    
    isRunningState() { return this.#state !== AsyncTask.State.RESOLVED; }
    isResolvedState() { return this.#state === AsyncTask.State.RESOLVED; }
    isResolved() { return this.#state === AsyncTask.State.RESOLVED; }
    
    async waitUntil(opts) {
      const { readyFn, waitableSetRep, cancellable } = opts;
      _debugLog('[AsyncTask#waitUntil()] args', { taskID: this.#id, waitableSetRep, cancellable });
      
      const state = getOrCreateAsyncState(this.#componentIdx);
      const wset = state.handles.get(waitableSetRep);
      
      let event;
      
      wset.incrementNumWaiting();
      
      const keepGoing = await this.suspendUntil({
        readyFn: () => {
          const hasPendingEvent = wset.hasPendingEvent();
          const ready = readyFn();
          return ready && hasPendingEvent;
        },
        cancellable,
      });
      
      if (keepGoing) {
        event = wset.getPendingEvent();
      } else {
        event = {
          code: ASYNC_EVENT_CODE.TASK_CANCELLED,
          payload0: 0,
          payload1: 0,
        };
      }
      
      wset.decrementNumWaiting();
      
      return event;
    }
    
    async yieldUntil(opts) {
      const { readyFn, cancellable } = opts;
      _debugLog('[AsyncTask#yieldUntil()] args', { taskID: this.#id, cancellable });
      
      const keepGoing = await this.suspendUntil({ readyFn, cancellable });
      if (keepGoing) {
        return {
          code: ASYNC_EVENT_CODE.NONE,
          payload0: 0,
          payload1: 0,
        };
      }
      
      return {
        code: ASYNC_EVENT_CODE.TASK_CANCELLED,
        payload0: 0,
        payload1: 0,
      };
    }
    
    async suspendUntil(opts) {
      const { cancellable, readyFn } = opts;
      _debugLog('[AsyncTask#suspendUntil()] args', { cancellable });
      
      const pendingCancelled = this.deliverPendingCancel({ cancellable });
      if (pendingCancelled) { return false; }
      
      const completed = await this.immediateSuspendUntil({ readyFn, cancellable });
      return completed;
    }
    
    // TODO(threads): equivalent to thread.suspend_until()
    async immediateSuspendUntil(opts) {
      const { cancellable, readyFn } = opts;
      _debugLog('[AsyncTask#immediateSuspendUntil()] args', { cancellable, readyFn });
      
      const ready = readyFn();
      if (ready && ASYNC_DETERMINISM === 'random') {
        const coinFlip = _coinFlip();
        if (coinFlip) { return true }
      }
      
      const keepGoing = await this.immediateSuspend({ cancellable, readyFn });
      return keepGoing;
    }
    
    async immediateSuspend(opts) { // NOTE: equivalent to thread.suspend()
    // TODO(threads): store readyFn on the thread
    const { cancellable, readyFn } = opts;
    _debugLog('[AsyncTask#immediateSuspend()] args', { cancellable, readyFn });
    
    const pendingCancelled = this.deliverPendingCancel({ cancellable });
    if (pendingCancelled) { return false; }
    
    const cstate = getOrCreateAsyncState(this.#componentIdx);
    const keepGoing = await cstate.suspendTask({ task: this, readyFn });
    return keepGoing;
  }
  
  deliverPendingCancel(opts) {
    const { cancellable } = opts;
    _debugLog('[AsyncTask#deliverPendingCancel()] args', { cancellable });
    
    if (cancellable && this.#state === AsyncTask.State.PENDING_CANCEL) {
      this.#state = AsyncTask.State.CANCEL_DELIVERED;
      return true;
    }
    
    return false;
  }
  
  isCancelled() { return this.cancelled }
  
  cancel(args) {
    _debugLog('[AsyncTask#cancel()] args', { });
    if (this.taskState() !== AsyncTask.State.CANCEL_DELIVERED) {
      throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] invalid task state [${this.taskState()}] for cancellation`);
    }
    if (this.borrowedHandles.length > 0) { throw new Error('task still has borrow handles'); }
    this.cancelled = true;
    this.onResolve(args?.error ?? new Error('task cancelled'));
    this.#state = AsyncTask.State.RESOLVED;
  }
  
  onResolve(taskValue) {
    const handlers = this.#onResolveHandlers;
    this.#onResolveHandlers = [];
    for (const f of handlers) {
      try {
        // TODO(fix): resolve handlers getting called a ton?
        f(taskValue);
      } catch (err) {
        _debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
        throw err;
      }
    }
    
    if (this.#parentSubtask) {
      const meta = this.#parentSubtask.getCallMetadata();
      // Run the rturn fn if it has not already been called -- this *should* have happened in
      // `task.return`, but some paths do not go through task.return (e.g. async lower of sync fn
      // which goes through prepare + async-start-call)
      if (meta.returnFn && !meta.returnFnCalled) {
        _debugLog('[AsyncTask#onResolve()] running returnFn', {
          componentIdx: this.#componentIdx,
          taskID: this.#id,
          subtaskID: this.#parentSubtask.id(),
        });
        const memory = meta.getMemoryFn();
        meta.returnFn.apply(null, [taskValue, meta.resultPtr]);
        meta.returnFnCalled = true;
      }
    }
    
    if (this.#postReturnFn) {
      _debugLog('[AsyncTask#onResolve()] running post return ', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
      });
      try {
        this.#postReturnFn(taskValue);
      } catch (err) {
        _debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
        throw err;
      }
    }
    
    if (this.#parentSubtask) {
      this.#parentSubtask.onResolve(taskValue);
    }
  }
  
  registerOnResolveHandler(f) {
    this.#onResolveHandlers.push(f);
  }
  
  isRejected() { return this.#rejected; }
  
  setErrored(err) {
    this.#errored = err;
  }
  
  reject(taskErr) {
    _debugLog('[AsyncTask#reject()] args', {
      componentIdx: this.#componentIdx,
      taskID: this.#id,
      parentSubtask: this.#parentSubtask,
      parentSubtaskID: this.#parentSubtask?.id(),
      entryFnName: this.entryFnName(),
      callbackFnName: this.#callbackFnName,
      errMsg: taskErr.message,
    });
    
    if (this.isResolvedState() || this.#rejected) { return; }
    
    for (const subtask of this.#subtasks) {
      subtask.reject(taskErr);
    }
    
    this.#rejected = true;
    this.cancelRequested = true;
    this.#state = AsyncTask.State.PENDING_CANCEL;
    const cancelled = this.deliverPendingCancel({ cancellable: true });
    
    // TODO: do cleanup here to reset the machinery so we can run again?
    
    
    this.cancel({ error: taskErr });
  }
  
  resolve(results) {
    _debugLog('[AsyncTask#resolve()] args', {
      componentIdx: this.#componentIdx,
      taskID: this.#id,
      entryFnName: this.entryFnName(),
      callbackFnName: this.#callbackFnName,
    });
    
    if (this.#state === AsyncTask.State.RESOLVED) {
      throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
    }
    
    if (this.borrowedHandles.length > 0) {
      throw new Error('task still has borrow handles');
    }
    
    this.#state = AsyncTask.State.RESOLVED;
    
    switch (results.length) {
      case 0:
      this.onResolve(undefined);
      break;
      case 1:
      this.onResolve(results[0]);
      break;
      default:
      _debugLog('[AsyncTask#resolve()] unexpected number of results', {
        componentIdx: this.#componentIdx,
        results,
        taskID: this.#id,
        subtaskID: this.#parentSubtask?.id(),
        entryFnName: this.#entryFnName,
        callbackFnName: this.#callbackFnName,
      });
      throw new Error('unexpected number of results');
    }
  }
  
  exit() {
    _debugLog('[AsyncTask#exit()]', {
      componentIdx: this.#componentIdx,
      taskID: this.#id,
    });
    
    if (this.#exited)  { throw new Error("task has already exited"); }
    
    if (this.#state !== AsyncTask.State.RESOLVED) {
      // TODO(fix): only fused, manually specified post returns seem to break this invariant,
      // as the TaskReturn trampoline is not activated it seems.
      //
      // see: test/p3/ported/wasmtime/component-async/post-return.js
      //
      // We *should* be able to upgrade this to be more strict and throw at some point,
      // which may involve rewriting the upstream test to surface task return manually somehow.
      //
      //throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
      _debugLog('[AsyncTask#exit()] task exited without resolution', {
        componentIdx: this.#componentIdx,
        taskID: this.#id,
        subtask: this.getParentSubtask(),
        subtaskID: this.getParentSubtask()?.id(),
      });
      this.#state = AsyncTask.State.RESOLVED;
    }
    
    if (this.borrowedHandles > 0) {
      throw new Error('task [${this.#id}] exited without clearing borrowed handles');
    }
    
    const state = getOrCreateAsyncState(this.#componentIdx);
    if (!state) { throw new Error('missing async state for component [' + this.#componentIdx + ']'); }
    
    // Exempt the host from exclusive lock check
    if (this.#componentIdx !== -1 && this.needsExclusiveLock() && !state.isExclusivelyLocked()) {
      throw new Error(`task [${this.#id}] exit: component [${this.#componentIdx}] should have been exclusively locked`);
    }
    
    state.exclusiveRelease();
    
    for (const f of this.#onExitHandlers) {
      try {
        f();
      } catch (err) {
        console.error("error during task exit handler", err);
        throw err;
      }
    }
    
    this.#exited = true;
    clearCurrentTask(this.#componentIdx, this.id());
  }
  
  needsExclusiveLock() {
    return !this.#isAsync || this.hasCallback();
  }
  
  createSubtask(args) {
    _debugLog('[AsyncTask#createSubtask()] args', args);
    const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
    
    const cstate = getOrCreateAsyncState(this.#componentIdx);
    if (!cstate) {
      throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
    }
    
    const waitable = new Waitable({
      componentIdx: this.#componentIdx,
      target: `subtask (internal ID [${this.#id}])`,
    });
    
    const newSubtask = new AsyncSubtask({
      componentIdx,
      childTask,
      parentTask: this,
      callMetadata,
      isAsync,
      isManualAsync,
      fnName,
      waitable,
    });
    this.#subtasks.push(newSubtask);
    newSubtask.setTarget(`subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`);
    waitable.setIdx(cstate.handles.insert(newSubtask));
    waitable.setTarget(`waitable for subtask (waitable id [${waitable.idx()}], subtask internal ID [${newSubtask.id()}])`);
    
    return newSubtask;
  }
  
  getLatestSubtask() {
    return this.#subtasks.at(-1);
  }
  
  getSubtaskByWaitableRep(rep) {
    if (rep === undefined) { throw new TypeError('missing rep'); }
    return this.#subtasks.find(s => s.waitableRep() === rep);
  }
  
  currentSubtask() {
    _debugLog('[AsyncTask#currentSubtask()]');
    if (this.#subtasks.length === 0) { return undefined; }
    return this.#subtasks.at(-1);
  }
  
  removeSubtask(subtask) {
    if (this.#subtasks.length === 0) { throw new Error('cannot end current subtask: no current subtask'); }
    this.#subtasks = this.#subtasks.filter(t => t !== subtask);
    return subtask;
  }
}

function _lowerImportBackwardsCompat(args) {
  const params = [...arguments].slice(1);
  _debugLog('[_lowerImportBackwardsCompat()] args', { args, params });
  const {
    functionIdx,
    componentIdx,
    isAsync,
    isManualAsync,
    paramLiftFns,
    resultLowerFns,
    funcTypeIsAsync,
    metadata,
    memoryIdx,
    getMemoryFn,
    getReallocFn,
    importFn,
  } = args;
  
  const { taskID } = _getGlobalCurrentTaskMeta(componentIdx);
  
  const taskMeta = getCurrentTask(componentIdx, taskID);
  if (!taskMeta) { throw new Error('invalid/missing async task meta'); }
  
  const task = taskMeta.task;
  if (!task) { throw new Error('invalid/missing async task'); }
  
  const cstate = getOrCreateAsyncState(componentIdx);
  
  // TODO: re-enable this check -- postReturn can call imports though,
  // and that breaks things.
  //
  // if (!cstate.mayLeave) {
    //     throw new Error(`cannot leave instance [${componentIdx}]`);
    // }
    
    if (!task.mayBlock() && funcTypeIsAsync && !isAsync) {
      throw new Error("non async exports cannot synchronously call async functions");
    }
    
    // If there is an existing task, this should be part of a subtask
    const memory = getMemoryFn();
    const subtask = task.createSubtask({
      componentIdx,
      parentTask: task,
      fnName: importFn.fnName,
      isAsync,
      isManualAsync,
      callMetadata: {
        memoryIdx,
        memory,
        realloc: getReallocFn(),
        resultPtr: params[0],
        lowers: resultLowerFns,
      }
    });
    task.setReturnMemoryIdx(memoryIdx);
    task.setReturnMemory(getMemoryFn());
    
    subtask.onStart();
    
    // If dealing with a sync lowered sync function, we can directly return results
    //
    // TODO(breaking): remove once we get rid of manual async import specification,
    // as func types cannot be detected in that case only (and we don't need that w/ p3)
    if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
      const res = importFn(...params);
      // TODO(breaking): remove once we get rid of manual async import specification,
      // as func types cannot be detected in that case only (and we don't need that w/ p3)
      if (!funcTypeIsAsync && !subtask.isReturned()) {
        throw new Error('post-execution subtasks must either be async or returned');
      }
      return subtask.getResult();
    }
    
    // Sync-lowered async functions requires async behavior because the callee *can* block,
    // but this call must *act* synchronously and return immediately with the result
    // (i.e. not returning until the work is done)
    //
    // TODO(breaking): remove checking for manual async specification here, once we can go p3-only
    //
    if (!isManualAsync && !isAsync && funcTypeIsAsync) {
      const { promise, resolve } = new Promise();
      queueMicrotask(async () => {
        if (!subtask.isResolvedState()) {
          await task.suspendUntil({ readyFn: () => task.isResolvedState() });
        }
        resolve(subtask.getResult());
      });
      return promise;
    }
    
    // NOTE: at this point we know that we are working with an async lowered import
    
    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState > 2**5) {
      throw new Error('invalid subtask state, out of valid range');
    }
    
    subtask.setOnProgressFn(() => {
      subtask.setPendingEvent(() => {
        if (subtask.isResolved()) { subtask.deliverResolve(); }
        const event = {
          code: ASYNC_EVENT_CODE.SUBTASK,
          payload0: subtask.waitableRep(),
          payload1: subtask.getStateNumber(),
        }
        return event;
      });
    });
    
    // This is a hack to maintain backwards compatibility with
    // manually-specified async imports, used in wasm exports that are
    // not actually async (but are specified as so).
    //
    // This is not normal p3 sync behavior but instead anticipating that
    // the caller that is doing manual async will be waiting for a promise that
    // resolves to the *actual* result.
    //
    // TODO(breaking): remove once manually specified async is removed
    //
    // There are a few cases:
    // 1. sync function with async types (e.g. `f: func() -> stream<u32>`)
    // 2. async function with async types (e.g. `f: async func() -> stream<u32>`)
    // 3. async function with sync types (e.g. `f: async func() -> list<u32>`)
    // 4. sync function with non-async types (e.g. `f: func() -> list<u32>`)
    //
    // This hack *only* applies to 4 -- the case where an async JS host function
    // is supplied to a Wasm export which does *not* need to do any async abi
    // lifting/lowering (async ABI did not exist when JSPI integratiton was
    // initially merged to enable asynchronously returning values from the host)
    //
    const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
    let manualAsyncResult;
    if (requiresManualAsyncResult) {
      manualAsyncResult = promiseWithResolvers();
    }
    
    queueMicrotask(async () => {
      try {
        _debugLog('[_lowerImportBackwardsCompat()] calling lowered import', { importFn, params });
        const res = await importFn(...params);
        if (requiresManualAsyncResult) {
          manualAsyncResult.resolve(subtask.getResult());
        }
      } catch (err) {
        _debugLog("[_lowerImportBackwardsCompat()] import fn error:", err);
        if (requiresManualAsyncResult) {
          manualAsyncResult.reject(err);
        }
        throw err;
      }
    });
    
    if (requiresManualAsyncResult) { return manualAsyncResult.promise; }
    
    return Number(subtask.waitableRep()) << 4 | subtaskState;
  }
  
  function _liftFlatU8(ctx) {
    _debugLog('[_liftFlatU8()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i32 argument'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 1) {
      throw new Error('not enough storage remaining for lift');
    }
    val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr, true);
    ctx.storagePtr += 1;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 1; }
    
    return [val, ctx];
  }
  
  function _liftFlatU16(ctx) {
    _debugLog('[_liftFlatU16()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (params.length === 0) { throw new Error('expected at least a single i32 argument'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 2) {
      throw new Error('not enough storage remaining for lift');
    }
    val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);
    ctx.storagePtr += 2;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 2; }
    
    return [val, ctx];
  }
  
  function _liftFlatU32(ctx) {
    _debugLog('[_liftFlatU32()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least a single i34 argument'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 4) {
      throw new Error('not enough storage remaining for lift');
    }
    val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
    ctx.storagePtr += 4;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 4; }
    
    return [val, ctx];
  }
  
  function _liftFlatU64(ctx) {
    _debugLog('[_liftFlatU64()] args', { ctx });
    let val;
    
    if (ctx.useDirectParams) {
      if (ctx.params.length === 0) { throw new Error('expected at least one single i64 argument'); }
      if (typeof ctx.params[0] !== 'bigint') { throw new Error('expected bigint'); }
      val = ctx.params[0];
      ctx.params = ctx.params.slice(1);
      return [val, ctx];
    }
    
    if (ctx.storageLen !== undefined && ctx.storageLen < ctx.storagePtr + 8) {
      throw new Error('not enough storage remaining for lift');
    }
    val = new DataView(ctx.memory.buffer).getBigUint64(ctx.storagePtr, true);
    ctx.storagePtr += 8;
    if (ctx.storageLen !== undefined) { ctx.storageLen -= 8; }
    
    return [val, ctx];
  }
  
  function _liftFlatVariant(casesAndLiftFns) {
    return function _liftFlatVariantInner(ctx) {
      _debugLog('[_liftFlatVariant()] args', { ctx });
      
      const origUseParams = ctx.useDirectParams;
      
      let caseIdx;
      if (casesAndLiftFns.length < 256) {
        let discriminantByteLen = 1;
        const [idx, newCtx] = _liftFlatU8(ctx);
        caseIdx = idx;
        ctx = newCtx;
      } else if (casesAndLiftFns.length > 256 && discriminantByteLen < 65536) {
        discriminantByteLen = 2;
        const [idx, newCtx] = _liftFlatU16(ctx);
        caseIdx = idx;
        ctx = newCtx;
      } else if (casesAndLiftFns.length > 65536 && discriminantByteLen < 4_294_967_296) {
        discriminantByteLen = 4;
        const [idx, newCtx] = _liftFlatU32(ctx);
        caseIdx = idx;
        ctx = newCtx;
      } else {
        throw new Error('unsupported number of cases [' + casesAndLIftFns.legnth + ']');
      }
      
      const [ tag, liftFn, size32, alignment32 ] = casesAndLiftFns[caseIdx];
      
      let val;
      if (liftFn === null) {
        val = { tag };
        return [val, ctx];
      }
      
      const [newVal, newCtx] = liftFn(ctx);
      ctx = newCtx;
      val = { tag, val: newVal };
      
      // TODO: adjust for alignment, as lift fn may not adjust for it (e.g. strings)!
      
      return [val, ctx];
    }
  }
  
  function _liftFlatList(elemLiftFn, alignment32, knownLen) {
    function _liftFlatListInner(ctx) {
      _debugLog('[_liftFlatList()] args', { ctx });
      
      let metaPtr;
      let dataPtr;
      let len;
      if (ctx.useDirectParams) {
        if (knownLen) {
          dataPtr = _liftFlatU32(ctx);
        } else {
          metaPtr = _liftFlatU32(ctx);
        }
      } else {
        if (knownLen) {
          dataPtr = _liftFlatU32(ctx);
        } else {
          metaPtr = _liftFlatU32(ctx);
        }
      }
      
      if (metaPtr) {
        if (dataPtr !== undefined) { throw new Error('both meta and data pointers should not be set yet'); }
        
        if (ctx.useDirectParams) {
          ctx.useDirectParams = false;
          ctx.storagePtr = metaPtr;
          ctx.storageLen = 8;
          
          dataPtr = _liftFlatU32(ctx);
          len = _liftFlatU32(ctx);
          
          ctx.useDirectParams = true;
          ctx.storagePtr = null;
          ctx.storageLen = null;
        } else {
          dataPtr = _liftFlatU32(ctx);
          len = _liftFlatU32(ctx);
        }
      }
      
      const val = [];
      for (var i = 0; i < len; i++) {
        ctx.storagePtr = Math.ceil(ctx.storagePtr / alignment32) * alignment32;
        const [res, nextCtx] = elemLiftFn(ctx);
        val.push(res);
        ctx = nextCtx;
      }
      
      return [val, ctx];
    }
  }
  
  function _liftFlatResult(casesAndLiftFns) {
    return function _liftFlatResultInner(ctx) {
      _debugLog('[_liftFlatResult()] args', { ctx });
      return _liftFlatVariant(casesAndLiftFns)(ctx);
    }
  }
  
  function _liftFlatBorrow(componentTableIdx, size, memory, vals, storagePtr, storageLen) {
    _debugLog('[_liftFlatBorrow()] args', { size, memory, vals, storagePtr, storageLen });
    throw new Error('flat lift for borrowed resources not yet implemented!');
  }
  
  function _lowerFlatU8(ctx) {
    _debugLog('[_lowerFlatU8()] args', ctx);
    const { memory, realloc, vals, storagePtr, storageLen } = ctx;
    if (vals.length !== 1) {
      throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
    }
    if (vals[0] > 255 || vals[0] < 0) { throw new Error('invalid value for core value representing u8'); }
    if (!memory) { throw new Error("missing memory for lower"); }
    new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
    
    // TODO: ALIGNMENT IS WRONG?
    
    return 1;
  }
  
  function _lowerFlatU16(memory, vals, storagePtr, storageLen) {
    _debugLog('[_lowerFlatU16()] args', { memory, vals, storagePtr, storageLen });
    if (vals.length !== 1) {
      throw new Error('unexpected number (' + vals.length + ') of core vals (expected 1)');
    }
    if (vals[0] > 65_535 || vals[0] < 0) { throw new Error('invalid value for core value representing u16'); }
    new DataView(memory.buffer).setUint16(storagePtr, vals[0], true);
    return 2;
  }
  
  function _lowerFlatU32(ctx) {
    _debugLog('[_lowerFlatU32()] args', { ctx });
    const { memory, realloc, vals, storagePtr, storageLen } = ctx;
    if (vals.length !== 1) { throw new Error('expected single value to lower, got (' + vals.length + ')'); }
    if (vals[0] > 4_294_967_295 || vals[0] < 0) { throw new Error('invalid value for core value representing u32'); }
    
    // TODO(refactor): fail loudly on misaligned flat lowers?
    const rem = ctx.storagePtr % 4;
    if (rem !== 0) { ctx.storagePtr += (4 - rem); }
    
    new DataView(memory.buffer).setUint32(storagePtr, vals[0], true);
    
    return 4;
  }
  
  function _lowerFlatU64(memory, vals, storagePtr, storageLen) {
    _debugLog('[_lowerFlatU64()] args', { memory, vals, storagePtr, storageLen });
    if (vals.length !== 1) { throw new Error('unexpected number of core vals'); }
    if (vals[0] > 18_446_744_073_709_551_615n || vals[0] < 0n) { throw new Error('invalid value for core value representing u64'); }
    new DataView(memory.buffer).setBigUint64(storagePtr, vals[0], true);
    return 8;
  }
  
  function _lowerFlatRecord(fieldMetas) {
    return (size, memory, vals, storagePtr, storageLen) => {
      const params = [...arguments].slice(5);
      _debugLog('[_lowerFlatRecord()] args', {
        size,
        memory,
        vals,
        storagePtr,
        storageLen,
        params,
        fieldMetas
      });
      
      const [start] = vals;
      if (storageLen !== undefined && size !== undefined && size > storageLen) {
        throw new Error('not enough storage remaining for record flat lower');
      }
      const data = new Uint8Array(memory.buffer, start, size);
      new Uint8Array(memory.buffer, storagePtr, size).set(data);
      return data.byteLength;
    }
  }
  
  function _lowerFlatVariant(metadata, extra) {
    const { discriminantSizeBytes, lowerMetas } = metadata;
    
    return function _lowerFlatVariantInner(ctx) {
      _debugLog('[_lowerFlatVariantInner()] args', ctx, discriminantSizeBytes, lowerMetas);
      const { memory, realloc, vals, storageLen, componentIdx } = ctx;
      let storagePtr = ctx.storagePtr;
      
      const { tag, val } = vals[0];
      const variant = lowerMetas.find(vm => vm.tag === tag);
      if (!variant) { throw new Error(`missing/invalid variant, no tag matches [${tag}] (options were ${variantMetas.map(vm => vm.tag)})`); }
      if (!variant.discriminant) { throw new Error(`missing/invalid discriminant for variant [${variant}]`); }
      
      let bytesWritten;
      let discriminantLowerArgs = { memory, realloc, vals: [variant.discriminant], storagePtr, componentIdx }
      switch (discriminantSizeBytes) {
        case 1:
        bytesWritten = _lowerFlatU8(discriminantLowerArgs);
        break;
        case 2:
        bytesWritten = _lowerFlatU16(discriminantLowerArgs);
        break;
        case 4:
        bytesWritten = _lowerFlatU32(discriminantLowerArgs);
        break;
        default:
        throw new Error(`unexpected discriminant size bytes [${discriminantSizeBytes}]`);
      }
      if (bytesWritten !== discriminantSizeBytes) {
        throw new Error("unexpectedly wrote more bytes than discriminant");
      }
      storagePtr += bytesWritten;
      
      // Adjust alignment after discriminant write
      const rem = storagePtr % variant.align32;
      if (rem !== 0) { storagePtr += (variant.align32 - rem); }
      bytesWritten += rem;
      
      bytesWritten += variant.lowerFn({ memory, realloc, vals: [val], storagePtr, storageLen, componentIdx });
      
      return bytesWritten;
    }
  }
  
  function _lowerFlatList(args) {
    const { elemLowerFn } = args;
    if (!elemLowerFn) { throw new TypeError("missing/invalid element lower fn for list"); }
    
    return function _lowerFlatListInner(ctx) {
      _debugLog('[_lowerFlatList()] args', { ctx });
      
      if (ctx.params.length < 2) { throw new Error('insufficient params left to lower list'); }
      const storagePtr = ctx.params[0];
      const elemCount = ctx.params[1];
      ctx.params = ctx.params.slice(2);
      
      if (ctx.useDirectParams) {
        const list = ctx.vals[0];
        if (!list) { throw new Error("missing direct param value"); }
        
        const elemLowerCtx = { storagePtr, memory: ctx.memory };
        for (let idx = 0; idx < list.length; idx++) {
          elemLowerCtx.vals = list.slice(idx, idx+1);
          elemLowerCtx.storagePtr += elemLowerFn(elemLowerCtx);
        }
        
        const bytesLowered = elemLowerCtx.storagePtr - ctx.storagePtr;
        ctx.storagePtr = elemLowerCtx.storagePtr;
        return bytesLowered;
      }
      
      if (ctx.vals.length !== 2) {
        throw new Error('indirect parameter loading must have a pointer and length as vals');
      }
      let [valStartPtr, valLen] = ctx.vals;
      const totalSizeBytes = valLen * size;
      if (ctx.storageLen !== undefined && totalSizeBytes > ctx.storageLen) {
        throw new Error('not enough storage remaining for list flat lower');
      }
      
      const data = new Uint8Array(memory.buffer, valStartPtr, totalSizeBytes);
      new Uint8Array(memory.buffer, storagePtr, totalSizeBytes).set(data);
      
      return totalSizeBytes;
    }
  }
  
  function _lowerFlatTuple(size, memory, vals, storagePtr, storageLen) {
    _debugLog('[_lowerFlatTuple()] args', { size, memory, vals, storagePtr, storageLen });
    let [start, len] = vals;
    if (storageLen !== undefined && len > storageLen) {
      throw new Error('not enough storage remaining for tuple flat lower');
    }
    const data = new Uint8Array(memory.buffer, start, len);
    new Uint8Array(memory.buffer, storagePtr, len).set(data);
    return data.byteLength;
  }
  
  function _lowerFlatEnum(size, memory, vals, storagePtr, storageLen) {
    _debugLog('[_lowerFlatEnum()] args', { size, memory, vals, storagePtr, storageLen });
    let [start] = vals;
    if (storageLen !== undefined && size !== undefined && size > storageLen) {
      throw new Error('not enough storage remaining for enum flat lower');
    }
    const data = new Uint8Array(memory.buffer, start, size);
    new Uint8Array(memory.buffer, storagePtr, size).set(data);
    return data.byteLength;
  }
  
  function _lowerFlatOption(size, memory, vals, storagePtr, storageLen) {
    _debugLog('[_lowerFlatOption()] args', { size, memory, vals, storagePtr, storageLen });
    let [start] = vals;
    if (storageLen !== undefined && size !== undefined && size > storageLen) {
      throw new Error('not enough storage remaining for option flat lower');
    }
    const data = new Uint8Array(memory.buffer, start, size);
    new Uint8Array(memory.buffer, storagePtr, size).set(data);
    return data.byteLength;
  }
  
  function _lowerFlatResult(lowerMetas) {
    const invalidTag = lowerMetas.find(t => t.tag !== 'ok' && t.tag !== 'error')
    if (invalidTag) { throw new Error(`invalid variant tag [${invalidTag}] found for result`); }
    
    return function _lowerFlatResultInner() {
      _debugLog('[_lowerFlatResult()] args', { lowerMetas });
      let lowerFn = _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas }, { forResult: true });
      return lowerFn.apply(null, arguments);
    };
  }
  
  function _lowerFlatOwn(size, memory, vals, storagePtr, storageLen) {
    _debugLog('[_lowerFlatOwn()] args', { size, memory, vals, storagePtr, storageLen });
    throw new Error('flat lower for owned resources not yet implemented!');
  }
  
  const STREAMS = new RepTable({ target: 'global stream map' });
  const ASYNC_STATE = new Map();
  
  function getOrCreateAsyncState(componentIdx, init) {
    if (!ASYNC_STATE.has(componentIdx)) {
      const newState = new ComponentAsyncState({ componentIdx });
      ASYNC_STATE.set(componentIdx, newState);
    }
    return ASYNC_STATE.get(componentIdx);
  }
  
  class ComponentAsyncState {
    static EVENT_HANDLER_EVENTS = [ 'backpressure-change' ];
    
    #componentIdx;
    #callingAsyncImport = false;
    #syncImportWait = promiseWithResolvers();
    #locked = false;
    #parkedTasks = new Map();
    #suspendedTasksByTaskID = new Map();
    #suspendedTaskIDs = [];
    #errored = null;
    
    #backpressure = 0;
    #backpressureWaiters = 0n;
    
    #handlerMap = new Map();
    #nextHandlerID = 0n;
    
    #tickLoop = null;
    #tickLoopInterval = null;
    
    #onExclusiveReleaseHandlers = [];
    
    mayLeave = true;
    
    handles;
    subtasks;
    
    constructor(args) {
      this.#componentIdx = args.componentIdx;
      this.handles = new RepTable({ target: `component [${this.#componentIdx}] handles (waitable objects)` });
      this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
    };
    
    componentIdx() { return this.#componentIdx; }
    
    errored() { return this.#errored !== null; }
    setErrored(err) {
      _debugLog('[ComponentAsyncState#setErrored()] component errored', { err, componentIdx: this.#componentIdx });
      if (this.#errored) { return; }
      if (!err) {
        err = new Error('error elswehere (see other component instance error)')
        err.componentIdx = this.#componentIdx;
      }
      this.#errored = err;
    }
    
    callingSyncImport(val) {
      if (val === undefined) { return this.#callingAsyncImport; }
      if (typeof val !== 'boolean') { throw new TypeError('invalid setting for async import'); }
      const prev = this.#callingAsyncImport;
      this.#callingAsyncImport = val;
      if (prev === true && this.#callingAsyncImport === false) {
        this.#notifySyncImportEnd();
      }
    }
    
    #notifySyncImportEnd() {
      const existing = this.#syncImportWait;
      this.#syncImportWait = promiseWithResolvers();
      existing.resolve();
    }
    
    async waitForSyncImportCallEnd() {
      await this.#syncImportWait.promise;
    }
    
    setBackpressure(v) {
      this.#backpressure = v;
      return this.#backpressure
    }
    getBackpressure() { return this.#backpressure; }
    
    incrementBackpressure() {
      const current = this.#backpressure;
      if (current < 0 || current > 2**16) {
        throw new Error(`invalid current backpressure value [${current}]`);
      }
      const newValue = this.getBackpressure() + 1;
      if (newValue >= 2**16) {
        throw new Error(`invalid new backpressure value [${newValue}], overflow`);
      }
      return this.setBackpressure(newValue);
    }
    
    decrementBackpressure() {
      const current = this.#backpressure;
      if (current < 0 || current > 2**16) {
        throw new Error(`invalid current backpressure value [${current}]`);
      }
      const newValue = Math.max(0, current - 1);
      if (newValue < 0) {
        throw new Error(`invalid new backpressure value [${newValue}], underflow`);
      }
      return this.setBackpressure(newValue);
    }
    hasBackpressure() { return this.#backpressure > 0; }
    
    waitForBackpressure() {
      let backpressureCleared = false;
      const cstate = this;
      cstate.addBackpressureWaiter();
      const handlerID = this.registerHandler({
        event: 'backpressure-change',
        fn: (bp) => {
          if (bp === 0) {
            cstate.removeHandler(handlerID);
            backpressureCleared = true;
          }
        }
      });
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (backpressureCleared) { return; }
          clearInterval(interval);
          cstate.removeBackpressureWaiter();
          resolve(null);
        }, 0);
      });
    }
    
    registerHandler(args) {
      const { event, fn } = args;
      if (!event) { throw new Error("missing handler event"); }
      if (!fn) { throw new Error("missing handler fn"); }
      
      if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) {
        throw new Error(`unrecognized event handler [${event}]`);
      }
      
      const handlerID = this.#nextHandlerID++;
      let handlers = this.#handlerMap.get(event);
      if (!handlers) {
        handlers = [];
        this.#handlerMap.set(event, handlers)
      }
      
      handlers.push({ id: handlerID, fn, event });
      return handlerID;
    }
    
    removeHandler(args) {
      const { event, handlerID } = args;
      const registeredHandlers = this.#handlerMap.get(event);
      if (!registeredHandlers) { return; }
      const found = registeredHandlers.find(h => h.id === handlerID);
      if (!found) { return; }
      this.#handlerMap.set(event, this.#handlerMap.get(event).filter(h => h.id !== handlerID));
    }
    
    getBackpressureWaiters() { return this.#backpressureWaiters; }
    addBackpressureWaiter() { this.#backpressureWaiters++; }
    removeBackpressureWaiter() {
      this.#backpressureWaiters--;
      if (this.#backpressureWaiters < 0) {
        throw new Error("unexepctedly negative number of backpressure waiters");
      }
    }
    
    isExclusivelyLocked() { return this.#locked === true; }
    setLocked(locked) {
      this.#locked = locked;
    }
    
    // TODO(fix): we might want to check for pre-locked status here, we should be deterministically
    // going from locked -> unlocked and vice versa
    exclusiveLock() {
      _debugLog('[ComponentAsyncState#exclusiveLock()]', {
        locked: this.#locked,
        componentIdx: this.#componentIdx,
      });
      this.setLocked(true);
    }
    
    exclusiveRelease() {
      _debugLog('[ComponentAsyncState#exclusiveRelease()] args', {
        locked: this.#locked,
        componentIdx: this.#componentIdx,
      });
      this.setLocked(false);
      
      this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter(v => !!v);
      for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) {
        try {
          this.#onExclusiveReleaseHandlers[idx] = null;
          f();
        } catch (err) {
          _debugLog("error while executing handler for next exclusive release", err);
          throw err;
        }
      }
    }
    
    onNextExclusiveRelease(fn) {
      _debugLog('[ComponentAsyncState#()onNextExclusiveRelease] registering');
      this.#onExclusiveReleaseHandlers.push(fn);
    }
    
    #getSuspendedTaskMeta(taskID) {
      return this.#suspendedTasksByTaskID.get(taskID);
    }
    
    #removeSuspendedTaskMeta(taskID) {
      _debugLog('[ComponentAsyncState#removeSuspendedTaskMeta()] removing suspended task', { taskID });
      const idx = this.#suspendedTaskIDs.findIndex(t => t === taskID);
      const meta = this.#suspendedTasksByTaskID.get(taskID);
      this.#suspendedTaskIDs[idx] = null;
      this.#suspendedTasksByTaskID.delete(taskID);
      return meta;
    }
    
    #addSuspendedTaskMeta(meta) {
      if (!meta) { throw new Error('missing task meta'); }
      const taskID = meta.taskID;
      this.#suspendedTasksByTaskID.set(taskID, meta);
      this.#suspendedTaskIDs.push(taskID);
      if (this.#suspendedTasksByTaskID.size < this.#suspendedTaskIDs.length - 10) {
        this.#suspendedTaskIDs = this.#suspendedTaskIDs.filter(t => t !== null);
      }
    }
    
    // TODO(threads): readyFn is normally on the thread
    suspendTask(args) {
      const { task, readyFn } = args;
      const taskID = task.id();
      _debugLog('[ComponentAsyncState#suspendTask()]', {
        taskID,
        componentIdx: this.#componentIdx,
        taskEntryFnName: task.entryFnName(),
        subtask: task.getParentSubtask(),
      });
      
      if (this.#getSuspendedTaskMeta(taskID)) {
        throw new Error(`task [${taskID}] already suspended`);
      }
      
      const { promise, resolve, reject } = promiseWithResolvers();
      this.#addSuspendedTaskMeta({
        task,
        taskID,
        readyFn,
        resume: () => {
          _debugLog('[ComponentAsyncState#suspendTask()] resuming suspended task', { taskID });
          // TODO(threads): it's thread cancellation we should be checking for below, not task
          resolve(!task.isCancelled());
        },
      });
      
      this.runTickLoop();
      
      return promise;
    }
    
    resumeTaskByID(taskID) {
      const meta = this.#removeSuspendedTaskMeta(taskID);
      if (!meta) { return; }
      if (meta.taskID !== taskID) { throw new Error('task ID does not match'); }
      meta.resume();
    }
    
    async runTickLoop() {
      if (this.#tickLoop !== null) { return; }
      this.#tickLoop = 1;
      setTimeout(async () => {
        let done = this.tick();
        while (!done) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          done = this.tick();
        }
        this.#tickLoop = null;
      }, 10);
    }
    
    tick() {
      // _debugLog('[ComponentAsyncState#tick()]', { suspendedTaskIDs: this.#suspendedTaskIDs });
      
      const resumableTasks = this.#suspendedTaskIDs.filter(t => t !== null);
      for (const taskID of resumableTasks) {
        const meta = this.#suspendedTasksByTaskID.get(taskID);
        if (!meta || !meta.readyFn) {
          throw new Error(`missing/invalid task despite ID [${taskID}] being present`);
        }
        
        // If the task failed via any means, allow the task to resume because
        // it's been cancelled -- the callback should immediately exit as well
        if (meta.task.isRejected()) {
          _debugLog('[ComponentAsyncState#suspendTask()] detected task rejection, leaving early', { meta });
          this.resumeTaskByID(taskID);
          return;
        }
        
        const isReady = meta.readyFn();
        if (!isReady) { continue; }
        
        this.resumeTaskByID(taskID);
      }
      
      return this.#suspendedTaskIDs.filter(t => t !== null).length === 0;
    }
    
    addStreamEndToTable(args) {
      _debugLog('[ComponentAsyncState#addStreamEnd()] args', args);
      const { tableIdx, streamEnd } = args;
      if (typeof streamEnd === 'number') { throw new Error("INSERTING BAD STREAMEND"); }
      
      let { table, componentIdx } = STREAM_TABLES[tableIdx];
      if (componentIdx === undefined || !table) {
        throw new Error(`invalid global stream table state for table [${tableIdx}]`);
      }
      
      const handle = table.insert(streamEnd);
      streamEnd.setHandle(handle);
      streamEnd.setStreamTableIdx(tableIdx);
      
      const cstate = getOrCreateAsyncState(componentIdx);
      const waitableIdx = cstate.handles.insert(streamEnd);
      streamEnd.setWaitableIdx(waitableIdx);
      
      _debugLog('[ComponentAsyncState#addStreamEnd()] added stream end', {
        tableIdx,
        table,
        handle,
        streamEnd,
        destComponentIdx: componentIdx,
      });
      
      return { handle, waitableIdx };
    }
    
    createWaitable(args) {
      return new Waitable({ target: args?.target, });
    }
    
    createStream(args) {
      _debugLog('[ComponentAsyncState#createStream()] args', args);
      const { tableIdx, elemMeta } = args;
      if (tableIdx === undefined) { throw new Error("missing table idx while adding stream"); }
      if (elemMeta === undefined) { throw new Error("missing element metadata while adding stream"); }
      
      const { table: localStreamTable, componentIdx } = STREAM_TABLES[tableIdx];
      if (!localStreamTable) {
        throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
      }
      if (componentIdx !== this.#componentIdx) {
        throw new Error('component idx mismatch while creating stream');
      }
      
      const readWaitable = this.createWaitable();
      const writeWaitable = this.createWaitable();
      
      const stream = new InternalStream({
        tableIdx,
        componentIdx: this.#componentIdx,
        elemMeta,
        readWaitable,
        writeWaitable,
      });
      stream.setGlobalStreamMapRep(STREAMS.insert(stream));
      
      const writeEnd = stream.writeEnd();
      writeEnd.setWaitableIdx(this.handles.insert(writeEnd));
      writeEnd.setHandle(localStreamTable.insert(writeEnd));
      if (writeEnd.streamTableIdx() !== tableIdx) { throw new Error("unexpectedly mismatched stream table"); }
      
      const writeEndWaitableIdx = writeEnd.waitableIdx();
      const writeEndHandle = writeEnd.handle();
      writeWaitable.setTarget(`waitable for stream write end (waitable [${writeEndWaitableIdx}])`);
      writeEnd.setTarget(`stream write end (waitable [${writeEndWaitableIdx}])`);
      
      const readEnd = stream.readEnd();
      readEnd.setWaitableIdx(this.handles.insert(readEnd));
      readEnd.setHandle(localStreamTable.insert(readEnd));
      if (readEnd.streamTableIdx() !== tableIdx) { throw new Error("unexpectedly mismatched stream table"); }
      
      const readEndWaitableIdx = readEnd.waitableIdx();
      const readEndHandle = readEnd.handle();
      readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
      readEnd.setTarget(`stream read end (waitable [${readEndWaitableIdx}])`);
      
      return {
        writeEndWaitableIdx,
        writeEndHandle,
        readEndWaitableIdx,
        readEndHandle,
      };
    }
    
    getStreamEnd(args) {
      _debugLog('[ComponentAsyncState#getStreamEnd()] args', args);
      const { tableIdx, streamEndHandle, streamEndWaitableIdx } = args;
      if (tableIdx === undefined) { throw new Error('missing table idx while getting stream end'); }
      
      const { table, componentIdx } = STREAM_TABLES[tableIdx];
      const cstate = getOrCreateAsyncState(componentIdx);
      
      let streamEnd;
      if (streamEndWaitableIdx !== undefined) {
        streamEnd = cstate.handles.get(streamEndWaitableIdx);
      } else if (streamEndHandle !== undefined) {
        if (!table) { throw new Error(`missing/invalid table [${tableIdx}] while getting stream end`); }
        streamEnd = table.get(streamEndHandle);
      } else {
        throw new TypeError("must specify either waitable idx or handle to retrieve stream");
      }
      
      if (!streamEnd) {
        throw new Error(`missing stream end (tableIdx [${tableIdx}], handle [${streamEndHandle}], waitableIdx [${streamEndWaitableIdx}])`);
      }
      if (tableIdx && streamEnd.streamTableIdx() !== tableIdx) {
        throw new Error(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
      }
      
      return streamEnd;
    }
    
    deleteStreamEnd(args) {
      _debugLog('[ComponentAsyncState#deleteStreamEnd()] args', args);
      const { tableIdx, streamEndWaitableIdx } = args;
      if (tableIdx === undefined) { throw new Error("missing table idx while removing stream end"); }
      if (streamEndWaitableIdx === undefined) { throw new Error("missing stream idx while removing stream end"); }
      
      const { table, componentIdx } = STREAM_TABLES[tableIdx];
      const cstate = getOrCreateAsyncState(componentIdx);
      
      const streamEnd = cstate.handles.get(streamEndWaitableIdx);
      if (!streamEnd) {
        throw new Error(`missing stream end [${streamEndWaitableIdx}] in component handles while deleting stream`);
      }
      if (streamEnd.streamTableIdx() !== tableIdx) {
        throw new Error(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
      }
      
      let removed = cstate.handles.remove(streamEnd.waitableIdx());
      if (!removed) {
        throw new Error(`failed to remove stream end [${streamEndWaitableIdx}] waitable obj in component [${componentIdx}]`);
      }
      
      removed = table.remove(streamEnd.handle());
      if (!removed) {
        throw new Error(`failed to remove stream end with handle [${streamEnd.handle()}] from stream table [${tableIdx}] in component [${componentIdx}]`);
      }
      
      return streamEnd;
    }
    
    removeStreamEndFromTable(args) {
      _debugLog('[ComponentAsyncState#removeStreamEndFromTable()] args', args);
      
      const { tableIdx, streamWaitableIdx } = args;
      if (tableIdx === undefined) { throw new Error("missing table idx while removing stream end"); }
      if (streamWaitableIdx === undefined) {
        throw new Error("missing stream end waitable idx while removing stream end");
      }
      
      const { table, componentIdx } = STREAM_TABLES[tableIdx];
      if (!table) { throw new Error(`missing/invalid table [${tableIdx}] while removing stream end`); }
      
      const cstate = getOrCreateAsyncState(componentIdx);
      
      const streamEnd = cstate.handles.get(streamWaitableIdx);
      if (!streamEnd) {
        throw new Error(`missing stream end (handle [${streamWaitableIdx}], table [${tableIdx}])`);
      }
      const handle = streamEnd.handle();
      
      let removed = cstate.handles.remove(streamWaitableIdx);
      if (!removed) {
        throw new Error(`failed to remove streamEnd from handles (waitable idx [${streamWaitableIdx}]), component [${componentIdx}])`);
      }
      
      removed = table.remove(handle);
      if (!removed) {
        throw new Error(`failed to remove streamEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
      }
      
      return streamEnd;
    }
  }
  
  const base64Compile = str => WebAssembly.compile(typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), b => b.charCodeAt(0)));
  
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  let _fs;
  async function fetchCompile (url) {
    if (isNode) {
      _fs = _fs || await import('node:fs/promises');
      return WebAssembly.compile(await _fs.readFile(url));
    }
    return fetch(url).then(WebAssembly.compileStreaming);
  }
  
  const symbolCabiDispose = Symbol.for('cabiDispose');
  
  const symbolRscHandle = Symbol('handle');
  
  const symbolRscRep = Symbol.for('cabiRep');
  
  const symbolDispose = Symbol.dispose || Symbol.for('dispose');
  
  const handleTables = [];
  
  class ComponentError extends Error {
    constructor (value) {
      const enumerable = typeof value !== 'string';
      super(enumerable ? `${String(value)} (see error.payload)` : value);
      Object.defineProperty(this, 'payload', { value, enumerable });
    }
  }
  
  function getErrorPayload(e) {
    if (e && hasOwnProperty.call(e, 'payload')) return e.payload;
    if (e instanceof Error) throw e;
    return e;
  }
  
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  
  const instantiateCore = WebAssembly.instantiate;
  
  
  let exports0;
  let exports1;
  const handleTable1 = [T_FLAG, 0];
  const captureTable1= new Map();
  let captureCnt1 = 0;
  handleTables[1] = handleTable1;
  
  const _trampoline4 = function() {
    _debugLog('[iface="wasi:cli/stderr@0.2.3", function="get-stderr"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'getStderr',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getStderr()
    })
    ;
    if (!(ret instanceof OutputStream)) {
      throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
    }
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnt1;
      captureTable1.set(rep, ret);
      handle0 = rscTableCreateOwn(handleTable1, rep);
    }
    _debugLog('[iface="wasi:cli/stderr@0.2.3", function="get-stderr"][Instruction::Return]', {
      funcName: 'get-stderr',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle0]);
    task.exit();
    return handle0;
  }
  _trampoline4.fnName = 'wasi:cli/stderr@0.2.3#getStderr';
  const handleTable2 = [T_FLAG, 0];
  const captureTable2= new Map();
  let captureCnt2 = 0;
  handleTables[2] = handleTable2;
  
  const _trampoline5 = function() {
    _debugLog('[iface="wasi:cli/stdin@0.2.3", function="get-stdin"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'getStdin',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getStdin()
    })
    ;
    if (!(ret instanceof InputStream)) {
      throw new TypeError('Resource error: Not a valid "InputStream" resource.');
    }
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnt2;
      captureTable2.set(rep, ret);
      handle0 = rscTableCreateOwn(handleTable2, rep);
    }
    _debugLog('[iface="wasi:cli/stdin@0.2.3", function="get-stdin"][Instruction::Return]', {
      funcName: 'get-stdin',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle0]);
    task.exit();
    return handle0;
  }
  _trampoline5.fnName = 'wasi:cli/stdin@0.2.3#getStdin';
  
  const _trampoline6 = function() {
    _debugLog('[iface="wasi:cli/stdout@0.2.3", function="get-stdout"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'getStdout',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getStdout()
    })
    ;
    if (!(ret instanceof OutputStream)) {
      throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
    }
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnt1;
      captureTable1.set(rep, ret);
      handle0 = rscTableCreateOwn(handleTable1, rep);
    }
    _debugLog('[iface="wasi:cli/stdout@0.2.3", function="get-stdout"][Instruction::Return]', {
      funcName: 'get-stdout',
      paramCount: 1,
      async: false,
      postReturn: false
    });
    task.resolve([handle0]);
    task.exit();
    return handle0;
  }
  _trampoline6.fnName = 'wasi:cli/stdout@0.2.3#getStdout';
  
  const _trampoline7 = function(arg0) {
    let variant0;
    switch (arg0) {
      case 0: {
        variant0= {
          tag: 'ok',
          val: undefined
        };
        break;
      }
      case 1: {
        variant0= {
          tag: 'err',
          val: undefined
        };
        break;
      }
      default: {
        throw new TypeError('invalid variant discriminant for expected');
      }
    }
    _debugLog('[iface="wasi:cli/exit@0.2.3", function="exit"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'exit',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret;_withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => exit(variant0)
    })
    ;
    _debugLog('[iface="wasi:cli/exit@0.2.3", function="exit"][Instruction::Return]', {
      funcName: 'exit',
      paramCount: 0,
      async: false,
      postReturn: false
    });
    task.resolve([ret]);
    task.exit();
  }
  _trampoline7.fnName = 'wasi:cli/exit@0.2.3#exit';
  let exports2;
  let memory0;
  let realloc0;
  let realloc0Async;
  
  const _trampoline8 = function(arg0) {
    _debugLog('[iface="wasi:cli/environment@0.2.3", function="get-environment"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'getEnvironment',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => getEnvironment()
    })
    ;
    var vec3 = ret;
    var len3 = vec3.length;
    var result3 = realloc0(0, 0, 4, len3 * 16);
    for (let i = 0; i < vec3.length; i++) {
      const e = vec3[i];
      const base = result3 + i * 16;var [tuple0_0, tuple0_1] = e;
      
      var encodeRes = _utf8AllocateAndEncode(tuple0_0, realloc0, memory0);
      var ptr1= encodeRes.ptr;
      var len1 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 4, len1, true);
      dataView(memory0).setUint32(base + 0, ptr1, true);
      
      var encodeRes = _utf8AllocateAndEncode(tuple0_1, realloc0, memory0);
      var ptr2= encodeRes.ptr;
      var len2 = encodeRes.len;
      
      dataView(memory0).setUint32(base + 12, len2, true);
      dataView(memory0).setUint32(base + 8, ptr2, true);
    }
    dataView(memory0).setUint32(arg0 + 4, len3, true);
    dataView(memory0).setUint32(arg0 + 0, result3, true);
    _debugLog('[iface="wasi:cli/environment@0.2.3", function="get-environment"][Instruction::Return]', {
      funcName: 'get-environment',
      paramCount: 0,
      async: false,
      postReturn: false
    });
    task.resolve([ret]);
    task.exit();
  }
  _trampoline8.fnName = 'wasi:cli/environment@0.2.3#getEnvironment';
  const handleTable0 = [T_FLAG, 0];
  const captureTable0= new Map();
  let captureCnt0 = 0;
  handleTables[0] = handleTable0;
  
  const _trampoline9 = function(arg0, arg1) {
    var handle1 = arg0;
    
    var rep2 = handleTable0[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable0.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Error$1.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:filesystem/types@0.2.3", function="filesystem-error-code"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'filesystemErrorCode',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'none',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    let ret = _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => filesystemErrorCode(rsc0)
    })
    ;
    for (const rsc of curResourceBorrows) {
      rsc[symbolRscHandle] = undefined;
    }
    curResourceBorrows = [];
    var variant4 = ret;
    if (variant4 === null || variant4=== undefined) {
      dataView(memory0).setInt8(arg1 + 0, 0, true);
    } else {
      const e = variant4;
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      var val3 = e;
      let enum3;
      switch (val3) {
        case 'access': {
          enum3 = 0;
          break;
        }
        case 'would-block': {
          enum3 = 1;
          break;
        }
        case 'already': {
          enum3 = 2;
          break;
        }
        case 'bad-descriptor': {
          enum3 = 3;
          break;
        }
        case 'busy': {
          enum3 = 4;
          break;
        }
        case 'deadlock': {
          enum3 = 5;
          break;
        }
        case 'quota': {
          enum3 = 6;
          break;
        }
        case 'exist': {
          enum3 = 7;
          break;
        }
        case 'file-too-large': {
          enum3 = 8;
          break;
        }
        case 'illegal-byte-sequence': {
          enum3 = 9;
          break;
        }
        case 'in-progress': {
          enum3 = 10;
          break;
        }
        case 'interrupted': {
          enum3 = 11;
          break;
        }
        case 'invalid': {
          enum3 = 12;
          break;
        }
        case 'io': {
          enum3 = 13;
          break;
        }
        case 'is-directory': {
          enum3 = 14;
          break;
        }
        case 'loop': {
          enum3 = 15;
          break;
        }
        case 'too-many-links': {
          enum3 = 16;
          break;
        }
        case 'message-size': {
          enum3 = 17;
          break;
        }
        case 'name-too-long': {
          enum3 = 18;
          break;
        }
        case 'no-device': {
          enum3 = 19;
          break;
        }
        case 'no-entry': {
          enum3 = 20;
          break;
        }
        case 'no-lock': {
          enum3 = 21;
          break;
        }
        case 'insufficient-memory': {
          enum3 = 22;
          break;
        }
        case 'insufficient-space': {
          enum3 = 23;
          break;
        }
        case 'not-directory': {
          enum3 = 24;
          break;
        }
        case 'not-empty': {
          enum3 = 25;
          break;
        }
        case 'not-recoverable': {
          enum3 = 26;
          break;
        }
        case 'unsupported': {
          enum3 = 27;
          break;
        }
        case 'no-tty': {
          enum3 = 28;
          break;
        }
        case 'no-such-device': {
          enum3 = 29;
          break;
        }
        case 'overflow': {
          enum3 = 30;
          break;
        }
        case 'not-permitted': {
          enum3 = 31;
          break;
        }
        case 'pipe': {
          enum3 = 32;
          break;
        }
        case 'read-only': {
          enum3 = 33;
          break;
        }
        case 'invalid-seek': {
          enum3 = 34;
          break;
        }
        case 'text-file-busy': {
          enum3 = 35;
          break;
        }
        case 'cross-device': {
          enum3 = 36;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val3}" is not one of the cases of error-code`);
        }
      }
      dataView(memory0).setInt8(arg1 + 1, enum3, true);
    }
    _debugLog('[iface="wasi:filesystem/types@0.2.3", function="filesystem-error-code"][Instruction::Return]', {
      funcName: 'filesystem-error-code',
      paramCount: 0,
      async: false,
      postReturn: false
    });
    task.resolve([ret]);
    task.exit();
  }
  _trampoline9.fnName = 'wasi:filesystem/types@0.2.3#filesystemErrorCode';
  const handleTable3 = [T_FLAG, 0];
  const captureTable3= new Map();
  let captureCnt3 = 0;
  handleTables[3] = handleTable3;
  
  const _trampoline10 = function(arg0, arg1, arg2) {
    var handle1 = arg0;
    
    var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTable3.get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
    }
    
    curResourceBorrows.push(rsc0);
    _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.write-via-stream"] [Instruction::CallInterface] (sync, @ enter)');
    let hostProvided = true;
    
    let parentTask;
    let task;
    let subtask;
    
    const createTask = () => {
      const results = createNewCurrentTask({
        componentIdx: -1, // 0,
        isAsync: false,
        entryFnName: 'writeViaStream',
        getCallbackFn: () => null,
        callbackFnName: 'null',
        errHandling: 'result-catch-handler',
        callingWasmExport: false,
      });
      task = results[0];
    };
    
    taskCreation: {
      parentTask = getCurrentTask(0)?.task;
      if (!parentTask) {
        createTask();
        break taskCreation;
      }
      
      createTask();
      
      if (hostProvided) {
        subtask = parentTask.getLatestSubtask();
        if (!subtask) {
          throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
        }
        task.setParentSubtask(subtask);
      }
    }
    
    const started = task.enterSync();
    
    let ret;
    try {
      ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
        componentIdx: task.componentIdx(),
        taskID: task.id(),
        fn: () => rsc0.writeViaStream(BigInt.asUintN(64, BigInt(arg1)))
      })
    };
  } catch (e) {
    ret = { tag: 'err', val: getErrorPayload(e) };
  }
  
  for (const rsc of curResourceBorrows) {
    rsc[symbolRscHandle] = undefined;
  }
  curResourceBorrows = [];
  var variant5 = ret;
  switch (variant5.tag) {
    case 'ok': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg2 + 0, 0, true);
      if (!(e instanceof OutputStream)) {
        throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
      }
      var handle3 = e[symbolRscHandle];
      if (!handle3) {
        const rep = e[symbolRscRep] || ++captureCnt1;
        captureTable1.set(rep, e);
        handle3 = rscTableCreateOwn(handleTable1, rep);
      }
      dataView(memory0).setInt32(arg2 + 4, handle3, true);
      break;
    }
    case 'err': {
      const e = variant5.val;
      dataView(memory0).setInt8(arg2 + 0, 1, true);
      var val4 = e;
      let enum4;
      switch (val4) {
        case 'access': {
          enum4 = 0;
          break;
        }
        case 'would-block': {
          enum4 = 1;
          break;
        }
        case 'already': {
          enum4 = 2;
          break;
        }
        case 'bad-descriptor': {
          enum4 = 3;
          break;
        }
        case 'busy': {
          enum4 = 4;
          break;
        }
        case 'deadlock': {
          enum4 = 5;
          break;
        }
        case 'quota': {
          enum4 = 6;
          break;
        }
        case 'exist': {
          enum4 = 7;
          break;
        }
        case 'file-too-large': {
          enum4 = 8;
          break;
        }
        case 'illegal-byte-sequence': {
          enum4 = 9;
          break;
        }
        case 'in-progress': {
          enum4 = 10;
          break;
        }
        case 'interrupted': {
          enum4 = 11;
          break;
        }
        case 'invalid': {
          enum4 = 12;
          break;
        }
        case 'io': {
          enum4 = 13;
          break;
        }
        case 'is-directory': {
          enum4 = 14;
          break;
        }
        case 'loop': {
          enum4 = 15;
          break;
        }
        case 'too-many-links': {
          enum4 = 16;
          break;
        }
        case 'message-size': {
          enum4 = 17;
          break;
        }
        case 'name-too-long': {
          enum4 = 18;
          break;
        }
        case 'no-device': {
          enum4 = 19;
          break;
        }
        case 'no-entry': {
          enum4 = 20;
          break;
        }
        case 'no-lock': {
          enum4 = 21;
          break;
        }
        case 'insufficient-memory': {
          enum4 = 22;
          break;
        }
        case 'insufficient-space': {
          enum4 = 23;
          break;
        }
        case 'not-directory': {
          enum4 = 24;
          break;
        }
        case 'not-empty': {
          enum4 = 25;
          break;
        }
        case 'not-recoverable': {
          enum4 = 26;
          break;
        }
        case 'unsupported': {
          enum4 = 27;
          break;
        }
        case 'no-tty': {
          enum4 = 28;
          break;
        }
        case 'no-such-device': {
          enum4 = 29;
          break;
        }
        case 'overflow': {
          enum4 = 30;
          break;
        }
        case 'not-permitted': {
          enum4 = 31;
          break;
        }
        case 'pipe': {
          enum4 = 32;
          break;
        }
        case 'read-only': {
          enum4 = 33;
          break;
        }
        case 'invalid-seek': {
          enum4 = 34;
          break;
        }
        case 'text-file-busy': {
          enum4 = 35;
          break;
        }
        case 'cross-device': {
          enum4 = 36;
          break;
        }
        default: {
          if ((e) instanceof Error) {
            console.error(e);
          }
          
          throw new TypeError(`"${val4}" is not one of the cases of error-code`);
        }
      }
      dataView(memory0).setInt8(arg2 + 4, enum4, true);
      break;
    }
    default: {
      throw new TypeError('invalid variant specified for result');
    }
  }
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.write-via-stream"][Instruction::Return]', {
    funcName: '[method]descriptor.write-via-stream',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline10.fnName = 'wasi:filesystem/types@0.2.3#writeViaStream';

const _trampoline11 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.append-via-stream"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'appendViaStream',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.appendViaStream()
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    if (!(e instanceof OutputStream)) {
      throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
    }
    var handle3 = e[symbolRscHandle];
    if (!handle3) {
      const rep = e[symbolRscRep] || ++captureCnt1;
      captureTable1.set(rep, e);
      handle3 = rscTableCreateOwn(handleTable1, rep);
    }
    dataView(memory0).setInt32(arg1 + 4, handle3, true);
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'access': {
        enum4 = 0;
        break;
      }
      case 'would-block': {
        enum4 = 1;
        break;
      }
      case 'already': {
        enum4 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum4 = 3;
        break;
      }
      case 'busy': {
        enum4 = 4;
        break;
      }
      case 'deadlock': {
        enum4 = 5;
        break;
      }
      case 'quota': {
        enum4 = 6;
        break;
      }
      case 'exist': {
        enum4 = 7;
        break;
      }
      case 'file-too-large': {
        enum4 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum4 = 9;
        break;
      }
      case 'in-progress': {
        enum4 = 10;
        break;
      }
      case 'interrupted': {
        enum4 = 11;
        break;
      }
      case 'invalid': {
        enum4 = 12;
        break;
      }
      case 'io': {
        enum4 = 13;
        break;
      }
      case 'is-directory': {
        enum4 = 14;
        break;
      }
      case 'loop': {
        enum4 = 15;
        break;
      }
      case 'too-many-links': {
        enum4 = 16;
        break;
      }
      case 'message-size': {
        enum4 = 17;
        break;
      }
      case 'name-too-long': {
        enum4 = 18;
        break;
      }
      case 'no-device': {
        enum4 = 19;
        break;
      }
      case 'no-entry': {
        enum4 = 20;
        break;
      }
      case 'no-lock': {
        enum4 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum4 = 22;
        break;
      }
      case 'insufficient-space': {
        enum4 = 23;
        break;
      }
      case 'not-directory': {
        enum4 = 24;
        break;
      }
      case 'not-empty': {
        enum4 = 25;
        break;
      }
      case 'not-recoverable': {
        enum4 = 26;
        break;
      }
      case 'unsupported': {
        enum4 = 27;
        break;
      }
      case 'no-tty': {
        enum4 = 28;
        break;
      }
      case 'no-such-device': {
        enum4 = 29;
        break;
      }
      case 'overflow': {
        enum4 = 30;
        break;
      }
      case 'not-permitted': {
        enum4 = 31;
        break;
      }
      case 'pipe': {
        enum4 = 32;
        break;
      }
      case 'read-only': {
        enum4 = 33;
        break;
      }
      case 'invalid-seek': {
        enum4 = 34;
        break;
      }
      case 'text-file-busy': {
        enum4 = 35;
        break;
      }
      case 'cross-device': {
        enum4 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 4, enum4, true);
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.append-via-stream"][Instruction::Return]', {
  funcName: '[method]descriptor.append-via-stream',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline11.fnName = 'wasi:filesystem/types@0.2.3#appendViaStream';

const _trampoline12 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.get-type"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'getType',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.getType()
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    var val3 = e;
    let enum3;
    switch (val3) {
      case 'unknown': {
        enum3 = 0;
        break;
      }
      case 'block-device': {
        enum3 = 1;
        break;
      }
      case 'character-device': {
        enum3 = 2;
        break;
      }
      case 'directory': {
        enum3 = 3;
        break;
      }
      case 'fifo': {
        enum3 = 4;
        break;
      }
      case 'symbolic-link': {
        enum3 = 5;
        break;
      }
      case 'regular-file': {
        enum3 = 6;
        break;
      }
      case 'socket': {
        enum3 = 7;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val3}" is not one of the cases of descriptor-type`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum3, true);
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val4 = e;
    let enum4;
    switch (val4) {
      case 'access': {
        enum4 = 0;
        break;
      }
      case 'would-block': {
        enum4 = 1;
        break;
      }
      case 'already': {
        enum4 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum4 = 3;
        break;
      }
      case 'busy': {
        enum4 = 4;
        break;
      }
      case 'deadlock': {
        enum4 = 5;
        break;
      }
      case 'quota': {
        enum4 = 6;
        break;
      }
      case 'exist': {
        enum4 = 7;
        break;
      }
      case 'file-too-large': {
        enum4 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum4 = 9;
        break;
      }
      case 'in-progress': {
        enum4 = 10;
        break;
      }
      case 'interrupted': {
        enum4 = 11;
        break;
      }
      case 'invalid': {
        enum4 = 12;
        break;
      }
      case 'io': {
        enum4 = 13;
        break;
      }
      case 'is-directory': {
        enum4 = 14;
        break;
      }
      case 'loop': {
        enum4 = 15;
        break;
      }
      case 'too-many-links': {
        enum4 = 16;
        break;
      }
      case 'message-size': {
        enum4 = 17;
        break;
      }
      case 'name-too-long': {
        enum4 = 18;
        break;
      }
      case 'no-device': {
        enum4 = 19;
        break;
      }
      case 'no-entry': {
        enum4 = 20;
        break;
      }
      case 'no-lock': {
        enum4 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum4 = 22;
        break;
      }
      case 'insufficient-space': {
        enum4 = 23;
        break;
      }
      case 'not-directory': {
        enum4 = 24;
        break;
      }
      case 'not-empty': {
        enum4 = 25;
        break;
      }
      case 'not-recoverable': {
        enum4 = 26;
        break;
      }
      case 'unsupported': {
        enum4 = 27;
        break;
      }
      case 'no-tty': {
        enum4 = 28;
        break;
      }
      case 'no-such-device': {
        enum4 = 29;
        break;
      }
      case 'overflow': {
        enum4 = 30;
        break;
      }
      case 'not-permitted': {
        enum4 = 31;
        break;
      }
      case 'pipe': {
        enum4 = 32;
        break;
      }
      case 'read-only': {
        enum4 = 33;
        break;
      }
      case 'invalid-seek': {
        enum4 = 34;
        break;
      }
      case 'text-file-busy': {
        enum4 = 35;
        break;
      }
      case 'cross-device': {
        enum4 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 1, enum4, true);
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.get-type"][Instruction::Return]', {
  funcName: '[method]descriptor.get-type',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline12.fnName = 'wasi:filesystem/types@0.2.3#getType';

const _trampoline13 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable3.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(Descriptor.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.stat"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'stat',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.stat()
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant12 = ret;
switch (variant12.tag) {
  case 'ok': {
    const e = variant12.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    var {type: v3_0, linkCount: v3_1, size: v3_2, dataAccessTimestamp: v3_3, dataModificationTimestamp: v3_4, statusChangeTimestamp: v3_5 } = e;
    var val4 = v3_0;
    let enum4;
    switch (val4) {
      case 'unknown': {
        enum4 = 0;
        break;
      }
      case 'block-device': {
        enum4 = 1;
        break;
      }
      case 'character-device': {
        enum4 = 2;
        break;
      }
      case 'directory': {
        enum4 = 3;
        break;
      }
      case 'fifo': {
        enum4 = 4;
        break;
      }
      case 'symbolic-link': {
        enum4 = 5;
        break;
      }
      case 'regular-file': {
        enum4 = 6;
        break;
      }
      case 'socket': {
        enum4 = 7;
        break;
      }
      default: {
        if ((v3_0) instanceof Error) {
          console.error(v3_0);
        }
        
        throw new TypeError(`"${val4}" is not one of the cases of descriptor-type`);
      }
    }
    dataView(memory0).setInt8(arg1 + 8, enum4, true);
    dataView(memory0).setBigInt64(arg1 + 16, toUint64(v3_1), true);
    dataView(memory0).setBigInt64(arg1 + 24, toUint64(v3_2), true);
    var variant6 = v3_3;
    if (variant6 === null || variant6=== undefined) {
      dataView(memory0).setInt8(arg1 + 32, 0, true);
    } else {
      const e = variant6;
      dataView(memory0).setInt8(arg1 + 32, 1, true);
      var {seconds: v5_0, nanoseconds: v5_1 } = e;
      dataView(memory0).setBigInt64(arg1 + 40, toUint64(v5_0), true);
      dataView(memory0).setInt32(arg1 + 48, toUint32(v5_1), true);
    }
    var variant8 = v3_4;
    if (variant8 === null || variant8=== undefined) {
      dataView(memory0).setInt8(arg1 + 56, 0, true);
    } else {
      const e = variant8;
      dataView(memory0).setInt8(arg1 + 56, 1, true);
      var {seconds: v7_0, nanoseconds: v7_1 } = e;
      dataView(memory0).setBigInt64(arg1 + 64, toUint64(v7_0), true);
      dataView(memory0).setInt32(arg1 + 72, toUint32(v7_1), true);
    }
    var variant10 = v3_5;
    if (variant10 === null || variant10=== undefined) {
      dataView(memory0).setInt8(arg1 + 80, 0, true);
    } else {
      const e = variant10;
      dataView(memory0).setInt8(arg1 + 80, 1, true);
      var {seconds: v9_0, nanoseconds: v9_1 } = e;
      dataView(memory0).setBigInt64(arg1 + 88, toUint64(v9_0), true);
      dataView(memory0).setInt32(arg1 + 96, toUint32(v9_1), true);
    }
    break;
  }
  case 'err': {
    const e = variant12.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var val11 = e;
    let enum11;
    switch (val11) {
      case 'access': {
        enum11 = 0;
        break;
      }
      case 'would-block': {
        enum11 = 1;
        break;
      }
      case 'already': {
        enum11 = 2;
        break;
      }
      case 'bad-descriptor': {
        enum11 = 3;
        break;
      }
      case 'busy': {
        enum11 = 4;
        break;
      }
      case 'deadlock': {
        enum11 = 5;
        break;
      }
      case 'quota': {
        enum11 = 6;
        break;
      }
      case 'exist': {
        enum11 = 7;
        break;
      }
      case 'file-too-large': {
        enum11 = 8;
        break;
      }
      case 'illegal-byte-sequence': {
        enum11 = 9;
        break;
      }
      case 'in-progress': {
        enum11 = 10;
        break;
      }
      case 'interrupted': {
        enum11 = 11;
        break;
      }
      case 'invalid': {
        enum11 = 12;
        break;
      }
      case 'io': {
        enum11 = 13;
        break;
      }
      case 'is-directory': {
        enum11 = 14;
        break;
      }
      case 'loop': {
        enum11 = 15;
        break;
      }
      case 'too-many-links': {
        enum11 = 16;
        break;
      }
      case 'message-size': {
        enum11 = 17;
        break;
      }
      case 'name-too-long': {
        enum11 = 18;
        break;
      }
      case 'no-device': {
        enum11 = 19;
        break;
      }
      case 'no-entry': {
        enum11 = 20;
        break;
      }
      case 'no-lock': {
        enum11 = 21;
        break;
      }
      case 'insufficient-memory': {
        enum11 = 22;
        break;
      }
      case 'insufficient-space': {
        enum11 = 23;
        break;
      }
      case 'not-directory': {
        enum11 = 24;
        break;
      }
      case 'not-empty': {
        enum11 = 25;
        break;
      }
      case 'not-recoverable': {
        enum11 = 26;
        break;
      }
      case 'unsupported': {
        enum11 = 27;
        break;
      }
      case 'no-tty': {
        enum11 = 28;
        break;
      }
      case 'no-such-device': {
        enum11 = 29;
        break;
      }
      case 'overflow': {
        enum11 = 30;
        break;
      }
      case 'not-permitted': {
        enum11 = 31;
        break;
      }
      case 'pipe': {
        enum11 = 32;
        break;
      }
      case 'read-only': {
        enum11 = 33;
        break;
      }
      case 'invalid-seek': {
        enum11 = 34;
        break;
      }
      case 'text-file-busy': {
        enum11 = 35;
        break;
      }
      case 'cross-device': {
        enum11 = 36;
        break;
      }
      default: {
        if ((e) instanceof Error) {
          console.error(e);
        }
        
        throw new TypeError(`"${val11}" is not one of the cases of error-code`);
      }
    }
    dataView(memory0).setInt8(arg1 + 8, enum11, true);
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:filesystem/types@0.2.3", function="[method]descriptor.stat"][Instruction::Return]', {
  funcName: '[method]descriptor.stat',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline13.fnName = 'wasi:filesystem/types@0.2.3#stat';

const _trampoline14 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.check-write"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'checkWrite',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.checkWrite()
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    dataView(memory0).setBigInt64(arg1 + 8, toUint64(e), true);
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'last-operation-failed': {
        const e = variant4.val;
        dataView(memory0).setInt8(arg1 + 8, 0, true);
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid "Error" resource.');
        }
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnt0;
          captureTable0.set(rep, e);
          handle3 = rscTableCreateOwn(handleTable0, rep);
        }
        dataView(memory0).setInt32(arg1 + 12, handle3, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg1 + 8, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`StreamError\``);
      }
    }
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.check-write"][Instruction::Return]', {
  funcName: '[method]output-stream.check-write',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline14.fnName = 'wasi:io/streams@0.2.3#checkWrite';

const _trampoline15 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.write"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'write',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.write(result3)
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'last-operation-failed': {
        const e = variant5.val;
        dataView(memory0).setInt8(arg3 + 4, 0, true);
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid "Error" resource.');
        }
        var handle4 = e[symbolRscHandle];
        if (!handle4) {
          const rep = e[symbolRscRep] || ++captureCnt0;
          captureTable0.set(rep, e);
          handle4 = rscTableCreateOwn(handleTable0, rep);
        }
        dataView(memory0).setInt32(arg3 + 8, handle4, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg3 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
      }
    }
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.write"][Instruction::Return]', {
  funcName: '[method]output-stream.write',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline15.fnName = 'wasi:io/streams@0.2.3#write';

const _trampoline16 = function(arg0, arg1) {
  var handle1 = arg0;
  
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-flush"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'blockingFlush',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.blockingFlush()
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant5 = ret;
switch (variant5.tag) {
  case 'ok': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 0, true);
    break;
  }
  case 'err': {
    const e = variant5.val;
    dataView(memory0).setInt8(arg1 + 0, 1, true);
    var variant4 = e;
    switch (variant4.tag) {
      case 'last-operation-failed': {
        const e = variant4.val;
        dataView(memory0).setInt8(arg1 + 4, 0, true);
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid "Error" resource.');
        }
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnt0;
          captureTable0.set(rep, e);
          handle3 = rscTableCreateOwn(handleTable0, rep);
        }
        dataView(memory0).setInt32(arg1 + 8, handle3, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg1 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant4.tag)}\` (received \`${variant4}\`) specified for \`StreamError\``);
      }
    }
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-flush"][Instruction::Return]', {
  funcName: '[method]output-stream.blocking-flush',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline16.fnName = 'wasi:io/streams@0.2.3#blockingFlush';

const _trampoline17 = function(arg0, arg1, arg2, arg3) {
  var handle1 = arg0;
  
  var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
  var rsc0 = captureTable1.get(rep2);
  if (!rsc0) {
    rsc0 = Object.create(OutputStream.prototype);
    Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1});
    Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2});
  }
  
  curResourceBorrows.push(rsc0);
  var ptr3 = arg1;
  var len3 = arg2;
  var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
  _debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-write-and-flush"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'blockingWriteAndFlush',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'result-catch-handler',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  
  let ret;
  try {
    ret = { tag: 'ok', val: _withGlobalCurrentTaskMeta({
      componentIdx: task.componentIdx(),
      taskID: task.id(),
      fn: () => rsc0.blockingWriteAndFlush(result3)
    })
  };
} catch (e) {
  ret = { tag: 'err', val: getErrorPayload(e) };
}

for (const rsc of curResourceBorrows) {
  rsc[symbolRscHandle] = undefined;
}
curResourceBorrows = [];
var variant6 = ret;
switch (variant6.tag) {
  case 'ok': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 0, true);
    break;
  }
  case 'err': {
    const e = variant6.val;
    dataView(memory0).setInt8(arg3 + 0, 1, true);
    var variant5 = e;
    switch (variant5.tag) {
      case 'last-operation-failed': {
        const e = variant5.val;
        dataView(memory0).setInt8(arg3 + 4, 0, true);
        if (!(e instanceof Error$1)) {
          throw new TypeError('Resource error: Not a valid "Error" resource.');
        }
        var handle4 = e[symbolRscHandle];
        if (!handle4) {
          const rep = e[symbolRscRep] || ++captureCnt0;
          captureTable0.set(rep, e);
          handle4 = rscTableCreateOwn(handleTable0, rep);
        }
        dataView(memory0).setInt32(arg3 + 8, handle4, true);
        break;
      }
      case 'closed': {
        dataView(memory0).setInt8(arg3 + 4, 1, true);
        break;
      }
      default: {
        throw new TypeError(`invalid variant tag value \`${JSON.stringify(variant5.tag)}\` (received \`${variant5}\`) specified for \`StreamError\``);
      }
    }
    break;
  }
  default: {
    throw new TypeError('invalid variant specified for result');
  }
}
_debugLog('[iface="wasi:io/streams@0.2.3", function="[method]output-stream.blocking-write-and-flush"][Instruction::Return]', {
  funcName: '[method]output-stream.blocking-write-and-flush',
  paramCount: 0,
  async: false,
  postReturn: false
});
task.resolve([ret]);
task.exit();
}
_trampoline17.fnName = 'wasi:io/streams@0.2.3#blockingWriteAndFlush';

const _trampoline18 = function(arg0, arg1) {
  _debugLog('[iface="wasi:random/random@0.2.3", function="get-random-bytes"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'getRandomBytes',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  let ret = _withGlobalCurrentTaskMeta({
    componentIdx: task.componentIdx(),
    taskID: task.id(),
    fn: () => getRandomBytes(BigInt.asUintN(64, BigInt(arg0)))
  })
  ;
  var val0 = ret;
  var len0 = val0.byteLength;
  var ptr0 = realloc0(0, 0, 1, len0 * 1);
  
  let valData0;
  const valLenBytes0 = len0 * 1;
  if (Array.isArray(val0)) {
    // Regular array likely containing numbers, write values to memory
    let offset = 0;
    const dv0 = new DataView(memory0.buffer);
    for (const v of val0) {
      dv0.setUint8(ptr0+ offset, v, true);
      offset += 1;
    }
  } else {
    // TypedArray / ArrayBuffer-like, direct copy
    valData0 = new Uint8Array(val0.buffer || val0, val0.byteOffset, valLenBytes0);
    const out0 = new Uint8Array(memory0.buffer, ptr0,valLenBytes0);
    out0.set(valData0);
  }
  
  dataView(memory0).setUint32(arg1 + 4, len0, true);
  dataView(memory0).setUint32(arg1 + 0, ptr0, true);
  _debugLog('[iface="wasi:random/random@0.2.3", function="get-random-bytes"][Instruction::Return]', {
    funcName: 'get-random-bytes',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline18.fnName = 'wasi:random/random@0.2.3#getRandomBytes';

const _trampoline19 = function(arg0) {
  _debugLog('[iface="wasi:filesystem/preopens@0.2.3", function="get-directories"] [Instruction::CallInterface] (sync, @ enter)');
  let hostProvided = true;
  
  let parentTask;
  let task;
  let subtask;
  
  const createTask = () => {
    const results = createNewCurrentTask({
      componentIdx: -1, // 0,
      isAsync: false,
      entryFnName: 'getDirectories',
      getCallbackFn: () => null,
      callbackFnName: 'null',
      errHandling: 'none',
      callingWasmExport: false,
    });
    task = results[0];
  };
  
  taskCreation: {
    parentTask = getCurrentTask(0)?.task;
    if (!parentTask) {
      createTask();
      break taskCreation;
    }
    
    createTask();
    
    if (hostProvided) {
      subtask = parentTask.getLatestSubtask();
      if (!subtask) {
        throw new Error(`Missing subtask (in parent task [${parentTask.id()}]) for host import, has the import been lowered? (ensure asyncImports are set properly)`);
      }
      task.setParentSubtask(subtask);
    }
  }
  
  const started = task.enterSync();
  let ret = _withGlobalCurrentTaskMeta({
    componentIdx: task.componentIdx(),
    taskID: task.id(),
    fn: () => getDirectories()
  })
  ;
  var vec3 = ret;
  var len3 = vec3.length;
  var result3 = realloc0(0, 0, 4, len3 * 12);
  for (let i = 0; i < vec3.length; i++) {
    const e = vec3[i];
    const base = result3 + i * 12;var [tuple0_0, tuple0_1] = e;
    if (!(tuple0_0 instanceof Descriptor)) {
      throw new TypeError('Resource error: Not a valid "Descriptor" resource.');
    }
    var handle1 = tuple0_0[symbolRscHandle];
    if (!handle1) {
      const rep = tuple0_0[symbolRscRep] || ++captureCnt3;
      captureTable3.set(rep, tuple0_0);
      handle1 = rscTableCreateOwn(handleTable3, rep);
    }
    dataView(memory0).setInt32(base + 0, handle1, true);
    
    var encodeRes = _utf8AllocateAndEncode(tuple0_1, realloc0, memory0);
    var ptr2= encodeRes.ptr;
    var len2 = encodeRes.len;
    
    dataView(memory0).setUint32(base + 8, len2, true);
    dataView(memory0).setUint32(base + 4, ptr2, true);
  }
  dataView(memory0).setUint32(arg0 + 4, len3, true);
  dataView(memory0).setUint32(arg0 + 0, result3, true);
  _debugLog('[iface="wasi:filesystem/preopens@0.2.3", function="get-directories"][Instruction::Return]', {
    funcName: 'get-directories',
    paramCount: 0,
    async: false,
    postReturn: false
  });
  task.resolve([ret]);
  task.exit();
}
_trampoline19.fnName = 'wasi:filesystem/preopens@0.2.3#getDirectories';
let exports3;
let realloc1;
let realloc1Async;
let postReturn0;
let postReturn0Async;
function trampoline0(handle) {
  const handleEntry = rscTableRemove(handleTable3, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable3.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable3.delete(handleEntry.rep);
    } else if (Descriptor[symbolCabiDispose]) {
      Descriptor[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline1(handle) {
  const handleEntry = rscTableRemove(handleTable1, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable1.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable1.delete(handleEntry.rep);
    } else if (OutputStream[symbolCabiDispose]) {
      OutputStream[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline2(handle) {
  const handleEntry = rscTableRemove(handleTable0, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable0.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable0.delete(handleEntry.rep);
    } else if (Error$1[symbolCabiDispose]) {
      Error$1[symbolCabiDispose](handleEntry.rep);
    }
  }
}
function trampoline3(handle) {
  const handleEntry = rscTableRemove(handleTable2, handle);
  if (handleEntry.own) {
    
    const rsc = captureTable2.get(handleEntry.rep);
    if (rsc) {
      if (rsc[symbolDispose]) rsc[symbolDispose]();
      captureTable2.delete(handleEntry.rep);
    } else if (InputStream[symbolCabiDispose]) {
      InputStream[symbolCabiDispose](handleEntry.rep);
    }
  }
}
let trampoline4 = _trampoline4.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 4,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline4.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn.bind(null, 1)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline4,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 4,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline4.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn.bind(null, 1)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline4,
},
);
let trampoline5 = _trampoline5.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 5,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline5.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn.bind(null, 2)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline5,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 5,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline5.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn.bind(null, 2)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline5,
},
);
let trampoline6 = _trampoline6.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 6,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline6.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn.bind(null, 1)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline6,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 6,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline6.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatOwn.bind(null, 1)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline6,
},
);
let trampoline7 = _trampoline7.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 7,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline7.manuallyAsync,
  paramLiftFns: [_liftFlatResult([['ok', null, null],['error', null, null],])],
  resultLowerFns: [],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline7,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 7,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline7.manuallyAsync,
  paramLiftFns: [_liftFlatResult([['ok', null, null],['error', null, null],])],
  resultLowerFns: [],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: null,
  getMemoryFn: () => null,
  getReallocFn: () => null,
  importFn: _trampoline7,
},
);
let trampoline8 = _trampoline8.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 8,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline8.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatTuple.bind(null, 0), typeIdx: 0 })],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline8,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 8,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline8.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatTuple.bind(null, 0), typeIdx: 0 })],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline8,
},
);
let trampoline9 = _trampoline9.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 9,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline9.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0)],
  resultLowerFns: [_lowerFlatOption.bind(null, 1)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline9,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 9,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline9.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 0)],
  resultLowerFns: [_lowerFlatOption.bind(null, 1)],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline9,
},
);
let trampoline10 = _trampoline10.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 10,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline10.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatOwn.bind(null, 1), align32: 4 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline10,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 10,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline10.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3),_liftFlatU64],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatOwn.bind(null, 1), align32: 4 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline10,
},
);
let trampoline11 = _trampoline11.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 11,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline11.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatOwn.bind(null, 1), align32: 4 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline11,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 11,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline11.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatOwn.bind(null, 1), align32: 4 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline11,
},
);
let trampoline12 = _trampoline12.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 12,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline12.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatEnum.bind(null, 1), align32: 1 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline12,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 12,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline12.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatEnum.bind(null, 1), align32: 1 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline12,
},
);
let trampoline13 = _trampoline13.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 13,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline13.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatRecord([{ field: 'type', lowerFn: _lowerFlatEnum.bind(null, 1), align32: 8 },{ field: 'link-count', lowerFn: _lowerFlatU64, align32: 8 },{ field: 'size', lowerFn: _lowerFlatU64, align32: 8 },{ field: 'data-access-timestamp', lowerFn: _lowerFlatOption.bind(null, 0), align32: 8 },{ field: 'data-modification-timestamp', lowerFn: _lowerFlatOption.bind(null, 0), align32: 8 },{ field: 'status-change-timestamp', lowerFn: _lowerFlatOption.bind(null, 0), align32: 8 },]), align32: 8 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline13,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 13,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline13.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 3)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatRecord([{ field: 'type', lowerFn: _lowerFlatEnum.bind(null, 1), align32: 8 },{ field: 'link-count', lowerFn: _lowerFlatU64, align32: 8 },{ field: 'size', lowerFn: _lowerFlatU64, align32: 8 },{ field: 'data-access-timestamp', lowerFn: _lowerFlatOption.bind(null, 0), align32: 8 },{ field: 'data-modification-timestamp', lowerFn: _lowerFlatOption.bind(null, 0), align32: 8 },{ field: 'status-change-timestamp', lowerFn: _lowerFlatOption.bind(null, 0), align32: 8 },]), align32: 8 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatEnum.bind(null, 0), align32: 1 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline13,
},
);
let trampoline14 = _trampoline14.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 14,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline14.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatU64, align32: 8 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline14,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 14,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline14.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: _lowerFlatU64, align32: 8 },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline14,
},
);
let trampoline15 = _trampoline15.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 15,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline15.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1),_liftFlatList.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline15,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 15,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline15.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1),_liftFlatList.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline15,
},
);
let trampoline16 = _trampoline16.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 16,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline16.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline16,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 16,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline16.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline16,
},
);
let trampoline17 = _trampoline17.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 17,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline17.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1),_liftFlatList.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline17,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 17,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline17.manuallyAsync,
  paramLiftFns: [_liftFlatBorrow.bind(null, 1),_liftFlatList.bind(null, 1)],
  resultLowerFns: [_lowerFlatResult([{ discriminant: 0, tag: 'ok', lowerFn: null, align32: null },{ discriminant: 1, tag: 'error', lowerFn: _lowerFlatVariant({ discriminantSizeBytes: 1, lowerMetas: [{ discriminant: 0, tag: 'last-operation-failed', lowerFn: _lowerFlatOwn.bind(null, 0), align32: 4, },{ discriminant: 1, tag: 'closed', lowerFn: null, align32: null, },] }), align32: 4 },])],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => null,
  importFn: _trampoline17,
},
);
let trampoline18 = _trampoline18.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 18,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline18.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatU8, typeIdx: 1 })],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline18,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 18,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline18.manuallyAsync,
  paramLiftFns: [_liftFlatU64],
  resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatU8, typeIdx: 1 })],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline18,
},
);
let trampoline19 = _trampoline19.manuallyAsync ? new WebAssembly.Suspending(_lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 19,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline19.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatTuple.bind(null, 17), typeIdx: 2 })],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline19,
},
)) : _lowerImportBackwardsCompat.bind(
null,
{
  trampolineIdx: 19,
  componentIdx: 0,
  isAsync: false,
  isManualAsync: _trampoline19.manuallyAsync,
  paramLiftFns: [],
  resultLowerFns: [_lowerFlatList({ elemLowerFn: _lowerFlatTuple.bind(null, 17), typeIdx: 2 })],
  funcTypeIsAsync: false,
  getCallbackFn: () => null,
  getPostReturnFn: () => null,
  isCancellable: false,
  memoryIdx: 0,
  getMemoryFn: () => memory0,
  getReallocFn: () => realloc0,
  importFn: _trampoline19,
},
);
let exports1BuildSqlQuery;

function buildSqlQuery(arg0, arg1, arg2) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  
  var encodeRes = _utf8AllocateAndEncode(arg1, realloc1, memory0);
  var ptr1= encodeRes.ptr;
  var len1 = encodeRes.len;
  
  var variant3 = arg2;
  let variant3_0;
  let variant3_1;
  let variant3_2;
  if (variant3 === null || variant3=== undefined) {
    variant3_0 = 0;
    variant3_1 = 0;
    variant3_2 = 0;
  } else {
    const e = variant3;
    
    var encodeRes = _utf8AllocateAndEncode(e, realloc1, memory0);
    var ptr2= encodeRes.ptr;
    var len2 = encodeRes.len;
    
    variant3_0 = 1;
    variant3_1 = ptr2;
    variant3_2 = len2;
  }
  _debugLog('[iface="build-sql-query", function="build-sql-query"][Instruction::CallWasm] enter', {
    funcName: 'build-sql-query',
    paramCount: 7,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'exports1BuildSqlQuery',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  task.setReturnMemoryIdx(0);
  task.setReturnMemory(memory0);
  let ret =   _withGlobalCurrentTaskMeta({
    taskID: task.id(),
    componentIdx: task.componentIdx(),
    fn: () => exports1BuildSqlQuery(ptr0, len0, ptr1, len1, variant3_0, variant3_1, variant3_2),
  });
  
  let variant6;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr4 = dataView(memory0).getUint32(ret + 4, true);
      var len4 = dataView(memory0).getUint32(ret + 8, true);
      var result4 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr4, len4));
      variant6= {
        tag: 'ok',
        val: result4
      };
      break;
    }
    case 1: {
      var ptr5 = dataView(memory0).getUint32(ret + 4, true);
      var len5 = dataView(memory0).getUint32(ret + 8, true);
      var result5 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr5, len5));
      variant6= {
        tag: 'err',
        val: result5
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="build-sql-query", function="build-sql-query"][Instruction::Return]', {
    funcName: 'build-sql-query',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant6;
  task.resolve([retCopy.val]);
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn0(ret);
  cstate.mayLeave = true;
  task.exit();
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}
let exports1HydrateResults;

function hydrateResults(arg0, arg1) {
  
  var encodeRes = _utf8AllocateAndEncode(arg0, realloc1, memory0);
  var ptr0= encodeRes.ptr;
  var len0 = encodeRes.len;
  
  
  var encodeRes = _utf8AllocateAndEncode(arg1, realloc1, memory0);
  var ptr1= encodeRes.ptr;
  var len1 = encodeRes.len;
  
  _debugLog('[iface="hydrate-results", function="hydrate-results"][Instruction::CallWasm] enter', {
    funcName: 'hydrate-results',
    paramCount: 4,
    async: false,
    postReturn: true,
  });
  const hostProvided = false;
  
  const [task, _wasm_call_currentTaskID] = createNewCurrentTask({
    componentIdx: 0,
    isAsync: false,
    isManualAsync: false,
    entryFnName: 'exports1HydrateResults',
    getCallbackFn: () => null,
    callbackFnName: 'null',
    errHandling: 'throw-result-err',
    callingWasmExport: true,
  });
  
  const started = task.enterSync();
  task.setReturnMemoryIdx(0);
  task.setReturnMemory(memory0);
  let ret =   _withGlobalCurrentTaskMeta({
    taskID: task.id(),
    componentIdx: task.componentIdx(),
    fn: () => exports1HydrateResults(ptr0, len0, ptr1, len1),
  });
  
  let variant4;
  switch (dataView(memory0).getUint8(ret + 0, true)) {
    case 0: {
      var ptr2 = dataView(memory0).getUint32(ret + 4, true);
      var len2 = dataView(memory0).getUint32(ret + 8, true);
      var result2 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr2, len2));
      variant4= {
        tag: 'ok',
        val: result2
      };
      break;
    }
    case 1: {
      var ptr3 = dataView(memory0).getUint32(ret + 4, true);
      var len3 = dataView(memory0).getUint32(ret + 8, true);
      var result3 = TEXT_DECODER_UTF8.decode(new Uint8Array(memory0.buffer, ptr3, len3));
      variant4= {
        tag: 'err',
        val: result3
      };
      break;
    }
    default: {
      throw new TypeError('invalid variant discriminant for expected');
    }
  }
  _debugLog('[iface="hydrate-results", function="hydrate-results"][Instruction::Return]', {
    funcName: 'hydrate-results',
    paramCount: 1,
    async: false,
    postReturn: true
  });
  const retCopy = variant4;
  task.resolve([retCopy.val]);
  
  let cstate = getOrCreateAsyncState(0);
  cstate.mayLeave = false;
  postReturn0(ret);
  cstate.mayLeave = true;
  task.exit();
  
  
  
  if (typeof retCopy === 'object' && retCopy.tag === 'err') {
    throw new ComponentError(retCopy.val);
  }
  return retCopy.val;
  
}

const $init = (() => {
  let gen = (function* _initGenerator () {
    const module0 = fetchCompile(new URL('./super_join.core.wasm', import.meta.url));
    const module1 = fetchCompile(new URL('./super_join.core2.wasm', import.meta.url));
    const module2 = base64Compile('AGFzbQEAAAABLghgAn9/AX9gBH9/f38Bf2ABfwBgAX8AYAJ/fwBgA39+fwBgBH9/f38AYAJ+fwADEhEAAQAAAgMEBQQEBAQGBAYHAwQFAXABEREHVxIBMAAAATEAAQEyAAIBMwADATQABAE1AAUBNgAGATcABwE4AAgBOQAJAjEwAAoCMTEACwIxMgAMAjEzAA0CMTQADgIxNQAPAjE2ABAIJGltcG9ydHMBAArVARELACAAIAFBABEAAAsPACAAIAEgAiADQQERAQALCwAgACABQQIRAAALCwAgACABQQMRAAALCQAgAEEEEQIACwkAIABBBREDAAsLACAAIAFBBhEEAAsNACAAIAEgAkEHEQUACwsAIAAgAUEIEQQACwsAIAAgAUEJEQQACwsAIAAgAUEKEQQACwsAIAAgAUELEQQACw8AIAAgASACIANBDBEGAAsLACAAIAFBDREEAAsPACAAIAEgAiADQQ4RBgALCwAgACABQQ8RBwALCQAgAEEQEQMACwAvCXByb2R1Y2VycwEMcHJvY2Vzc2VkLWJ5AQ13aXQtY29tcG9uZW50BzAuMjI3LjEA9QcEbmFtZQATEndpdC1jb21wb25lbnQ6c2hpbQHYBxEAJ2FkYXB0LXdhc2lfc25hcHNob3RfcHJldmlldzEtcmFuZG9tX2dldAElYWRhcHQtd2FzaV9zbmFwc2hvdF9wcmV2aWV3MS1mZF93cml0ZQIoYWRhcHQtd2FzaV9zbmFwc2hvdF9wcmV2aWV3MS1lbnZpcm9uX2dldAMuYWRhcHQtd2FzaV9zbmFwc2hvdF9wcmV2aWV3MS1lbnZpcm9uX3NpemVzX2dldAQmYWRhcHQtd2FzaV9zbmFwc2hvdF9wcmV2aWV3MS1wcm9jX2V4aXQFM2luZGlyZWN0LXdhc2k6Y2xpL2Vudmlyb25tZW50QDAuMi4zLWdldC1lbnZpcm9ubWVudAY6aW5kaXJlY3Qtd2FzaTpmaWxlc3lzdGVtL3R5cGVzQDAuMi4zLWZpbGVzeXN0ZW0tZXJyb3ItY29kZQdIaW5kaXJlY3Qtd2FzaTpmaWxlc3lzdGVtL3R5cGVzQDAuMi4zLVttZXRob2RdZGVzY3JpcHRvci53cml0ZS12aWEtc3RyZWFtCElpbmRpcmVjdC13YXNpOmZpbGVzeXN0ZW0vdHlwZXNAMC4yLjMtW21ldGhvZF1kZXNjcmlwdG9yLmFwcGVuZC12aWEtc3RyZWFtCUBpbmRpcmVjdC13YXNpOmZpbGVzeXN0ZW0vdHlwZXNAMC4yLjMtW21ldGhvZF1kZXNjcmlwdG9yLmdldC10eXBlCjxpbmRpcmVjdC13YXNpOmZpbGVzeXN0ZW0vdHlwZXNAMC4yLjMtW21ldGhvZF1kZXNjcmlwdG9yLnN0YXQLQGluZGlyZWN0LXdhc2k6aW8vc3RyZWFtc0AwLjIuMy1bbWV0aG9kXW91dHB1dC1zdHJlYW0uY2hlY2std3JpdGUMOmluZGlyZWN0LXdhc2k6aW8vc3RyZWFtc0AwLjIuMy1bbWV0aG9kXW91dHB1dC1zdHJlYW0ud3JpdGUNQ2luZGlyZWN0LXdhc2k6aW8vc3RyZWFtc0AwLjIuMy1bbWV0aG9kXW91dHB1dC1zdHJlYW0uYmxvY2tpbmctZmx1c2gOTWluZGlyZWN0LXdhc2k6aW8vc3RyZWFtc0AwLjIuMy1bbWV0aG9kXW91dHB1dC1zdHJlYW0uYmxvY2tpbmctd3JpdGUtYW5kLWZsdXNoDzJpbmRpcmVjdC13YXNpOnJhbmRvbS9yYW5kb21AMC4yLjMtZ2V0LXJhbmRvbS1ieXRlcxA3aW5kaXJlY3Qtd2FzaTpmaWxlc3lzdGVtL3ByZW9wZW5zQDAuMi4yLWdldC1kaXJlY3Rvcmllcw');
    const module3 = base64Compile('AGFzbQEAAAABLghgAn9/AX9gBH9/f38Bf2ABfwBgAX8AYAJ/fwBgA39+fwBgBH9/f38AYAJ+fwACbBIAATAAAAABMQABAAEyAAAAATMAAAABNAACAAE1AAMAATYABAABNwAFAAE4AAQAATkABAACMTAABAACMTEABAACMTIABgACMTMABAACMTQABgACMTUABwACMTYAAwAIJGltcG9ydHMBcAEREQkXAQBBAAsRAAECAwQFBgcICQoLDA0ODxAALwlwcm9kdWNlcnMBDHByb2Nlc3NlZC1ieQENd2l0LWNvbXBvbmVudAcwLjIyNy4xABwEbmFtZQAVFHdpdC1jb21wb25lbnQ6Zml4dXBz');
    ({ exports: exports0 } = yield instantiateCore(yield module2));
    ({ exports: exports1 } = yield instantiateCore(yield module0, {
      wasi_snapshot_preview1: {
        environ_get: exports0['2'],
        environ_sizes_get: exports0['3'],
        fd_write: exports0['1'],
        proc_exit: exports0['4'],
        random_get: exports0['0'],
      },
    }));
    ({ exports: exports2 } = yield instantiateCore(yield module1, {
      __main_module__: {
        cabi_realloc: exports1.cabi_realloc,
      },
      env: {
        memory: exports1.memory,
      },
      'wasi:cli/environment@0.2.3': {
        'get-environment': exports0['5'],
      },
      'wasi:cli/exit@0.2.3': {
        exit: trampoline7,
      },
      'wasi:cli/stderr@0.2.3': {
        'get-stderr': trampoline4,
      },
      'wasi:cli/stdin@0.2.3': {
        'get-stdin': trampoline5,
      },
      'wasi:cli/stdout@0.2.3': {
        'get-stdout': trampoline6,
      },
      'wasi:filesystem/preopens@0.2.2': {
        'get-directories': exports0['16'],
      },
      'wasi:filesystem/types@0.2.3': {
        '[method]descriptor.append-via-stream': exports0['8'],
        '[method]descriptor.get-type': exports0['9'],
        '[method]descriptor.stat': exports0['10'],
        '[method]descriptor.write-via-stream': exports0['7'],
        '[resource-drop]descriptor': trampoline0,
        'filesystem-error-code': exports0['6'],
      },
      'wasi:io/error@0.2.3': {
        '[resource-drop]error': trampoline2,
      },
      'wasi:io/streams@0.2.3': {
        '[method]output-stream.blocking-flush': exports0['13'],
        '[method]output-stream.blocking-write-and-flush': exports0['14'],
        '[method]output-stream.check-write': exports0['11'],
        '[method]output-stream.write': exports0['12'],
        '[resource-drop]input-stream': trampoline3,
        '[resource-drop]output-stream': trampoline1,
      },
      'wasi:random/random@0.2.3': {
        'get-random-bytes': exports0['15'],
      },
    }));
    memory0 = exports1.memory;
    realloc0 = exports2.cabi_import_realloc;
    
    try {
      realloc0Async = WebAssembly.promising(exports2.cabi_import_realloc);
    } catch(err) {
      realloc0Async = exports2.cabi_import_realloc;
    }
    
    ({ exports: exports3 } = yield instantiateCore(yield module3, {
      '': {
        $imports: exports0.$imports,
        '0': exports2.random_get,
        '1': exports2.fd_write,
        '10': trampoline13,
        '11': trampoline14,
        '12': trampoline15,
        '13': trampoline16,
        '14': trampoline17,
        '15': trampoline18,
        '16': trampoline19,
        '2': exports2.environ_get,
        '3': exports2.environ_sizes_get,
        '4': exports2.proc_exit,
        '5': trampoline8,
        '6': trampoline9,
        '7': trampoline10,
        '8': trampoline11,
        '9': trampoline12,
      },
    }));
    realloc1 = exports1.cabi_realloc;
    
    try {
      realloc1Async = WebAssembly.promising(exports1.cabi_realloc);
    } catch(err) {
      realloc1Async = exports1.cabi_realloc;
    }
    
    postReturn0 = exports1['cabi_post_build-sql-query'];
    
    try {
      postReturn0Async = WebAssembly.promising(exports1['cabi_post_build-sql-query']);
    } catch(err) {
      postReturn0Async = exports1['cabi_post_build-sql-query'];
    }
    
    exports1BuildSqlQuery = exports1['build-sql-query'];
    exports1HydrateResults = exports1['hydrate-results'];
  })();
  let promise, resolve, reject;
  function runNext (value) {
    try {
      let done;
      do {
        ({ value, done } = gen.next(value));
      } while (!(value instanceof Promise) && !done);
      if (done) {
        if (resolve) resolve(value);
        else return value;
      }
      if (!promise) promise = new Promise((_resolve, _reject) => (resolve = _resolve, reject = _reject));
      value.then(runNext, reject);
    }
    catch (e) {
      if (reject) reject(e);
      else throw e;
    }
  }
  const maybeSyncReturn = runNext(null);
  return promise || maybeSyncReturn;
})();

await $init;

export { buildSqlQuery, hydrateResults,  }