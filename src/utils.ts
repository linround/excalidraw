import oc from "open-color";

import colors from "./colors";
import {
  CURSOR_TYPE,
  DEFAULT_VERSION,
  EVENT,
  FONT_FAMILY,
  isDarwin,
  MIME_TYPES,
  THEME,
  WINDOWS_EMOJI_FALLBACK_FONT,
} from "./constants";
import { FontFamilyValues, FontString } from "./element/types";
import { AppState, DataURL, LastActiveTool, Zoom } from "./types";
import { unstable_batchedUpdates } from "react-dom"; // react18自动批处理数据更新，
import { SHAPES } from "./shapes";
import { isEraserActive, isHandToolActive } from "./appState";
import { ResolutionType } from "./utility-types";

let mockDateTime: string | null = null;

export const setDateTimeForTests = (dateTime: string) => {
  mockDateTime = dateTime;
};

export const getDateTime = () => {
  if (mockDateTime) {
    return mockDateTime;
  }

  const date = new Date();
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hr = `${date.getHours()}`.padStart(2, "0");
  const min = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}-${hr}${min}`;
};

export const capitalizeString = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const isToolIcon = (
  target: Element | EventTarget | null,
): target is HTMLElement =>
  target instanceof HTMLElement && target.className.includes("ToolIcon");

export const isInputLike = (
  target: Element | EventTarget | null,
): target is
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLBRElement
  | HTMLDivElement =>
  (target instanceof HTMLElement && target.dataset.type === "wysiwyg") ||
  target instanceof HTMLBRElement || // newline in wysiwyg
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement;

export const isWritableElement = (
  target: Element | EventTarget | null,
): target is
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLBRElement
  | HTMLDivElement =>
  (target instanceof HTMLElement && target.dataset.type === "wysiwyg") ||
  target instanceof HTMLBRElement || // newline in wysiwyg
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement &&
    (target.type === "text" || target.type === "number"));

export const getFontFamilyString = ({
  fontFamily,
}: {
  fontFamily: FontFamilyValues;
}) => {
  for (const [fontFamilyString, id] of Object.entries(FONT_FAMILY)) {
    if (id === fontFamily) {
      return `${fontFamilyString}, ${WINDOWS_EMOJI_FALLBACK_FONT}`;
    }
  }
  return WINDOWS_EMOJI_FALLBACK_FONT;
};

/** returns fontSize+fontFamily string for assignment to DOM elements */
export const getFontString = ({
  fontSize,
  fontFamily,
}: {
  fontSize: number;
  fontFamily: FontFamilyValues;
}) => {
  return `${fontSize}px ${getFontFamilyString({ fontFamily })}` as FontString;
};

export const debounce = <T extends any[]>(
  fn: (...args: T) => void,
  timeout: number,
) => {
  let handle = 0;
  let lastArgs: T | null = null;
  const ret = (...args: T) => {
    lastArgs = args;
    clearTimeout(handle);
    handle = window.setTimeout(() => {
      lastArgs = null;
      fn(...args);
    }, timeout);
  };
  ret.flush = () => {
    clearTimeout(handle);
    if (lastArgs) {
      const _lastArgs = lastArgs;
      lastArgs = null;
      fn(..._lastArgs);
    }
  };
  ret.cancel = () => {
    lastArgs = null;
    clearTimeout(handle);
  };
  return ret;
};

// throttle callback to execute once per animation frame
export const throttleRAF = <T extends any[]>(
  fn: (...args: T) => void,
  opts?: { trailing?: boolean },
) => {
  // 首先这里会调用生成一个函数
  let timerId: number | null = null;
  let lastArgs: T | null = null;
  let lastArgsTrailing: T | null = null;
  // console.clear()
  // 这里会执行一次以便生成对应的函数
  // console.log(1)
  const scheduleFunc = (args: T) => {

    // console.log(3)
    // requestAnimationFrame
    // 告诉浏览器，希望执行一个动画，并且要求在下次重绘之前调用指定的回调函数更新动画
    // 通过传入一个回调函数，该回调函数会在浏览器下一次重绘之前执行
    timerId = window.requestAnimationFrame(() => {
      // console.log(4)
      timerId = null;
      fn(...args);
      lastArgs = null;
      if (lastArgsTrailing) {
        lastArgs = lastArgsTrailing;
        lastArgsTrailing = null;
        scheduleFunc(lastArgs);
      }
    });
  };
  // 一开始的时候会返回这个ret函数
  const ret = (...args: T) => {
    // console.log(2)
    if (process.env.NODE_ENV === "test") {
      fn(...args);
      return;
    }
    lastArgs = args;
    if (timerId === null) {
      scheduleFunc(lastArgs);
    } else if (opts?.trailing) {
      lastArgsTrailing = args;
    }
  };
  ret.flush = () => {
    if (timerId !== null) {
      cancelAnimationFrame(timerId);
      timerId = null;
    }
    if (lastArgs) {
      fn(...(lastArgsTrailing || lastArgs));
      lastArgs = lastArgsTrailing = null;
    }
  };
  ret.cancel = () => {
    lastArgs = lastArgsTrailing = null;
    if (timerId !== null) {
      cancelAnimationFrame(timerId);
      timerId = null;
    }
  };
  return ret;
};

/**
 * Exponential ease-out method
 *
 * @param {number} k - The value to be tweened.
 * @returns {number} The tweened value.
 */
function easeOut(k: number): number {
  return 1 - Math.pow(1 - k, 4);
}

/**
 * Compute new values based on the same ease function and trigger the
 * callback through a requestAnimationFrame call
 *
 * use `opts` to define a duration and/or an easeFn
 *
 * for example:
 * ```ts
 * easeToValuesRAF([10, 20, 10], [0, 0, 0], (a, b, c) => setState(a,b, c))
 * ```
 *
 * @param fromValues The initial values, must be numeric
 * @param toValues The destination values, must also be numeric
 * @param callback The callback receiving the values
 * @param opts default to 250ms duration and the easeOut function
 */
export const easeToValuesRAF = (
  fromValues: number[],
  toValues: number[],
  callback: (...values: number[]) => void,
  opts?: { duration?: number; easeFn?: (value: number) => number },
) => {
  let canceled = false;
  let frameId = 0;
  let startTime: number;

  const duration = opts?.duration || 250; // default animation to 0.25 seconds
  const easeFn = opts?.easeFn || easeOut; // default the easeFn to easeOut

  function step(timestamp: number) {
    if (canceled) {
      return;
    }
    if (startTime === undefined) {
      startTime = timestamp;
    }

    const elapsed = timestamp - startTime;

    if (elapsed < duration) {
      // console.log(elapsed, duration, elapsed / duration);
      const factor = easeFn(elapsed / duration);
      const newValues = fromValues.map(
        (fromValue, index) =>
          (toValues[index] - fromValue) * factor + fromValue,
      );

      callback(...newValues);
      frameId = window.requestAnimationFrame(step);
    } else {
      // ensure final values are reached at the end of the transition
      callback(...toValues);
    }
  }

  frameId = window.requestAnimationFrame(step);

  return () => {
    canceled = true;
    window.cancelAnimationFrame(frameId);
  };
};

// https://github.com/lodash/lodash/blob/es/chunk.js
export const chunk = <T extends any>(
  array: readonly T[],
  size: number,
): T[][] => {
  if (!array.length || size < 1) {
    return [];
  }
  let index = 0;
  let resIndex = 0;
  const result = Array(Math.ceil(array.length / size));
  while (index < array.length) {
    result[resIndex++] = array.slice(index, (index += size));
  }
  return result;
};

export const selectNode = (node: Element) => {
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }
};

export const removeSelection = () => {
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
  }
};

export const distance = (x: number, y: number) => Math.abs(x - y);

export const updateActiveTool = (
  appState: Pick<AppState, "activeTool">,
  data: (
    | { type: typeof SHAPES[number]["value"] | "eraser" | "hand" }
    | { type: "custom"; customType: string }
  ) & { lastActiveToolBeforeEraser?: LastActiveTool },
): AppState["activeTool"] => {
  if (data.type === "custom") {
    return {
      ...appState.activeTool,
      type: "custom",
      customType: data.customType,
    };
  }

  return {
    ...appState.activeTool,
    lastActiveTool:
      data.lastActiveToolBeforeEraser === undefined
        ? appState.activeTool.lastActiveTool
        : data.lastActiveToolBeforeEraser,
    type: data.type,
    customType: null,
  };
};

export const resetCursor = (canvas: HTMLCanvasElement | null) => {
  // console.log('resetCursor:')
  if (canvas) {
    canvas.style.cursor = "";
  }
};

export const setCursor = (canvas: HTMLCanvasElement | null, cursor: string) => {
  // console.log('cursor:',cursor)
  if (canvas) {
    canvas.style.cursor = cursor;
  }
};

let eraserCanvasCache: any;
let previewDataURL: string;
export const setEraserCursor = (
  canvas: HTMLCanvasElement | null,
  theme: AppState["theme"],
) => {
  const cursorImageSizePx = 20;

  const drawCanvas = () => {
    const isDarkTheme = theme === THEME.DARK;
    eraserCanvasCache = document.createElement("canvas");
    eraserCanvasCache.theme = theme;
    eraserCanvasCache.height = cursorImageSizePx;
    eraserCanvasCache.width = cursorImageSizePx;
    const context = eraserCanvasCache.getContext("2d")!;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(
      eraserCanvasCache.width / 2,
      eraserCanvasCache.height / 2,
      5,
      0,
      2 * Math.PI,
    );
    context.fillStyle = isDarkTheme ? oc.black : oc.white;
    context.fill();
    context.strokeStyle = isDarkTheme ? oc.white : oc.black;
    context.stroke();
    previewDataURL = eraserCanvasCache.toDataURL(MIME_TYPES.svg) as DataURL;
  };
  if (!eraserCanvasCache || eraserCanvasCache.theme !== theme) {
    drawCanvas();
  }

  setCursor(
    canvas,
    `url(${previewDataURL}) ${cursorImageSizePx / 2} ${
      cursorImageSizePx / 2
    }, auto`,
  );
};

export const setCursorForShape = (
  canvas: HTMLCanvasElement | null,
  appState: AppState,
) => {
  // 一下是为了设置在选择操作后的光标显示
  // 比如图像，文字，箭头
  if (!canvas) {
    return;
  }
  if (appState.activeTool.type === "selection") {
    // console.log('selection')
    // 普通箭头选择
    resetCursor(canvas);
  } else if (isHandToolActive(appState)) {
    // console.log('isHandToolActive')
    // 拖拽
    canvas.style.cursor = CURSOR_TYPE.GRAB;
  } else if (isEraserActive(appState)) {
    // console.log('isEraserActive')
    // 选择橡皮擦
    setEraserCursor(canvas, appState.theme);
    // do nothing if image tool is selected which suggests there's
    // a image-preview set as the cursor
    // Ignore custom type as well and let host decide
  } else if (!["image", "custom"].includes(appState.activeTool.type)) {
    // console.log('image, custom')
    canvas.style.cursor = CURSOR_TYPE.CROSSHAIR;
  }
};

export const isFullScreen = () =>
  document.fullscreenElement?.nodeName === "HTML";

export const allowFullScreen = () =>
  document.documentElement.requestFullscreen();

export const exitFullScreen = () => document.exitFullscreen();

export const getShortcutKey = (shortcut: string): string => {
  shortcut = shortcut
    .replace(/\bAlt\b/i, "Alt")
    .replace(/\bShift\b/i, "Shift")
    .replace(/\b(Enter|Return)\b/i, "Enter");
  if (isDarwin) {
    return shortcut
      .replace(/\bCtrlOrCmd\b/gi, "Cmd")
      .replace(/\bAlt\b/i, "Option");
  }
  return shortcut.replace(/\bCtrlOrCmd\b/gi, "Ctrl");
};

export const viewportCoordsToSceneCoords = (
  { clientX, clientY }: { clientX: number; clientY: number },
  {
    zoom,
    offsetLeft,
    offsetTop,
    scrollX,
    scrollY,
  }: {
    zoom: Zoom;
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
  },
) => {
  // 向上滚 scrollY是负的 -100
  // 向左平移 scrollY是负的 -100
  // 以下计算鼠标位置的逻辑：
  // 如果图片发生了放大
  // 整个整体的视觉绝对性会发生缩小的效果
  const x = (clientX - offsetLeft) / zoom.value - scrollX;
  const y = (clientY - offsetTop) / zoom.value - scrollY;

  // console.clear()
  // console.log('clientX,clientY',clientX,clientY)
  // console.log('offsetLeft,offsetTop',offsetLeft,offsetTop)
  // console.log('scrollX,scrollY',scrollX,scrollY)
  // console.log(zoom)
  // console.log('x,y',{x,y})
  // 计算鼠标点再整个画布的坐标点
  return { x, y };
};

export const sceneCoordsToViewportCoords = (
  { sceneX, sceneY }: { sceneX: number; sceneY: number },
  {
    zoom,
    offsetLeft,
    offsetTop,
    scrollX,
    scrollY,
  }: {
    zoom: Zoom;
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
  },
) => {
  const x = (sceneX + scrollX) * zoom.value + offsetLeft;
  const y = (sceneY + scrollY) * zoom.value + offsetTop;
  return { x, y };
};

export const getGlobalCSSVariable = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--${name}`);

const RS_LTR_CHARS =
  "A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF" +
  "\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF";
const RS_RTL_CHARS = "\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC";
const RE_RTL_CHECK = new RegExp(`^[^${RS_LTR_CHARS}]*[${RS_RTL_CHARS}]`);
/**
 * Checks whether first directional character is RTL. Meaning whether it starts
 *  with RTL characters, or indeterminate (numbers etc.) characters followed by
 *  RTL.
 * See https://github.com/excalidraw/excalidraw/pull/1722#discussion_r436340171
 */
export const isRTL = (text: string) => RE_RTL_CHECK.test(text);

export const tupleToCoors = (
  xyTuple: readonly [number, number],
): { x: number; y: number } => {
  const [x, y] = xyTuple;
  return { x, y };
};

/** use as a rejectionHandler to mute filesystem Abort errors */
export const muteFSAbortError = (error?: Error) => {
  if (error?.name === "AbortError") {
    console.warn(error);
    return;
  }
  throw error;
};

export const findIndex = <T>(
  array: readonly T[],
  cb: (element: T, index: number, array: readonly T[]) => boolean,
  fromIndex: number = 0,
) => {
  if (fromIndex < 0) {
    fromIndex = array.length + fromIndex;
  }
  fromIndex = Math.min(array.length, Math.max(fromIndex, 0));
  let index = fromIndex - 1;
  while (++index < array.length) {
    if (cb(array[index], index, array)) {
      return index;
    }
  }
  return -1;
};

export const findLastIndex = <T>(
  array: readonly T[],
  cb: (element: T, index: number, array: readonly T[]) => boolean,
  fromIndex: number = array.length - 1,
) => {
  if (fromIndex < 0) {
    fromIndex = array.length + fromIndex;
  }
  fromIndex = Math.min(array.length - 1, Math.max(fromIndex, 0));
  let index = fromIndex + 1;
  while (--index > -1) {
    if (cb(array[index], index, array)) {
      return index;
    }
  }
  return -1;
};

export const isTransparent = (color: string) => {
  const isRGBTransparent = color.length === 5 && color.substr(4, 1) === "0";
  const isRRGGBBTransparent = color.length === 9 && color.substr(7, 2) === "00";
  return (
    isRGBTransparent ||
    isRRGGBBTransparent ||
    color === colors.elementBackground[0]
  );
};

export type ResolvablePromise<T> = Promise<T> & {
  resolve: [T] extends [undefined] ? (value?: T) => void : (value: T) => void;
  reject: (error: Error) => void;
};
export const resolvablePromise = <T>() => {
  let resolve!: any;
  let reject!: any;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  (promise as any).resolve = resolve;
  (promise as any).reject = reject;
  return promise as ResolvablePromise<T>;
};

/**
 * @param func handler taking at most single parameter (event).
 */
export const withBatchedUpdates = <
  TFunction extends ((event: any) => void) | (() => void),
>(
  func: Parameters<TFunction>["length"] extends 0 | 1 ? TFunction : never,
) =>
  ((event) => {
    unstable_batchedUpdates(func as TFunction, event);
  }) as TFunction;

/**
 * barches React state updates and throttles the calls to a single call per
 * animation frame
 */
export const withBatchedUpdatesThrottled = <
  TFunction extends ((event: any) => void) | (() => void),
>(
  func: Parameters<TFunction>["length"] extends 0 | 1 ? TFunction : never,
) => {
  // @ts-ignore
  return throttleRAF<Parameters<TFunction>>(((event) => {
    unstable_batchedUpdates(func, event);
  }) as TFunction);
};

//https://stackoverflow.com/a/9462382/8418
export const nFormatter = (num: number, digits: number): string => {
  const si = [
    { value: 1, symbol: "b" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  let index;
  for (index = si.length - 1; index > 0; index--) {
    if (num >= si[index].value) {
      break;
    }
  }
  return (
    (num / si[index].value).toFixed(digits).replace(rx, "$1") + si[index].symbol
  );
};

export const getVersion = () => {
  return (
    document.querySelector<HTMLMetaElement>('meta[name="version"]')?.content ||
    DEFAULT_VERSION
  );
};

// Adapted from https://github.com/Modernizr/Modernizr/blob/master/feature-detects/emoji.js
export const supportsEmoji = () => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  const offset = 12;
  ctx.fillStyle = "#f00";
  ctx.textBaseline = "top";
  ctx.font = "32px Arial";
  // Modernizr used 🐨, but it is sort of supported on Windows 7.
  // Luckily 😀 isn't supported.
  ctx.fillText("😀", 0, 0);
  return ctx.getImageData(offset, offset, 1, 1).data[0] !== 0;
};

export const getNearestScrollableContainer = (
  element: HTMLElement,
): HTMLElement | Document => {
  let parent = element.parentElement;
  while (parent) {
    if (parent === document.body) {
      return document;
    }
    const { overflowY } = window.getComputedStyle(parent);
    const hasScrollableContent = parent.scrollHeight > parent.clientHeight;
    if (
      hasScrollableContent &&
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay")
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document;
};

export const focusNearestParent = (element: HTMLInputElement) => {
  let parent = element.parentElement;
  while (parent) {
    if (parent.tabIndex > -1) {
      parent.focus();
      return;
    }
    parent = parent.parentElement;
  }
};

export const preventUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  // NOTE: modern browsers no longer allow showing a custom message here
  event.returnValue = "";
};

export const bytesToHexString = (bytes: Uint8Array) => {
  return Array.from(bytes)
    .map((byte) => `0${byte.toString(16)}`.slice(-2))
    .join("");
};

export const getUpdatedTimestamp = () => (isTestEnv() ? 1 : Date.now());

/**
 * Transforms array of objects containing `id` attribute,
 * or array of ids (strings), into a Map, keyd by `id`.
 */
export const arrayToMap = <T extends { id: string } | string>(
  items: readonly T[],
) => {
  return items.reduce((acc: Map<string, T>, element) => {
    acc.set(typeof element === "string" ? element : element.id, element);
    return acc;
  }, new Map());
};

export const arrayToMapWithIndex = <T extends { id: string }>(
  elements: readonly T[],
) =>
  elements.reduce((acc, element: T, idx) => {
    acc.set(element.id, [element, idx]);
    return acc;
  }, new Map<string, [element: T, index: number]>());

export const isTestEnv = () => process.env.NODE_ENV === "test";

export const wrapEvent = <T extends Event>(name: EVENT, nativeEvent: T) => {
  return new CustomEvent(name, {
    detail: {
      nativeEvent,
    },
    cancelable: true,
  });
};

export const updateObject = <T extends Record<string, any>>(
  obj: T,
  updates: Partial<T>,
): T => {
  let didChange = false;
  for (const key in updates) {
    const value = (updates as any)[key];
    if (typeof value !== "undefined") {
      if (
        (obj as any)[key] === value &&
        // if object, always update because its attrs could have changed
        (typeof value !== "object" || value === null)
      ) {
        continue;
      }
      didChange = true;
    }
  }

  if (!didChange) {
    return obj;
  }

  return {
    ...obj,
    ...updates,
  };
};

export const isPrimitive = (val: any) => {
  const type = typeof val;
  return val == null || (type !== "object" && type !== "function");
};

export const getFrame = () => {
  try {
    return window.self === window.top ? "top" : "iframe";
  } catch (error) {
    return "iframe";
  }
};

export const isPromiseLike = (
  value: any,
): value is Promise<ResolutionType<typeof value>> => {
  return (
    !!value &&
    typeof value === "object" &&
    "then" in value &&
    "catch" in value &&
    "finally" in value
  );
};

export const queryFocusableElements = (container: HTMLElement | null) => {
  const focusableElements = container?.querySelectorAll<HTMLElement>(
    "button, a, input, select, textarea, div[tabindex], label[tabindex]",
  );

  return focusableElements
    ? Array.from(focusableElements).filter(
        (element) =>
          element.tabIndex > -1 && !(element as HTMLInputElement).disabled,
      )
    : [];
};

export const isShallowEqual = <T extends Record<string, any>>(
  objA: T,
  objB: T,
) => {
  const aKeys = Object.keys(objA);
  const bKeys = Object.keys(objA);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => objA[key] === objB[key]);
};

// taken from Radix UI
// https://github.com/radix-ui/primitives/blob/main/packages/core/primitive/src/primitive.tsx
export const composeEventHandlers = <E>(
  originalEventHandler?: (event: E) => void,
  ourEventHandler?: (event: E) => void,
  { checkForDefaultPrevented = true } = {},
) => {
  return function handleEvent(event: E) {
    originalEventHandler?.(event);

    if (
      !checkForDefaultPrevented ||
      !(event as unknown as Event).defaultPrevented
    ) {
      return ourEventHandler?.(event);
    }
  };
};
