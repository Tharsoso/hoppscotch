import {
  defineCageModule,
  defineSandboxFunctionRaw,
} from "faraday-cage/modules"
import { uint8ArrayToVmArray, vmArrayToUint8Array } from "./utils/vm-marshal"

export type CustomEncodingModuleConfig = {
  textEncoderImpl?: typeof TextEncoder
  textDecoderImpl?: typeof TextDecoder
}

// Bridges the WHATWG TextEncoder/TextDecoder classes into the sandbox.
//
// faraday-cage ships its own `encoding()` module that does the same bridging,
// but its generic value marshaller only special-cases `Array.isArray()`
// values. A `Uint8Array` (what a real `TextEncoder.encode()` returns) fails
// that check, so it falls through to a "plain object" branch that copies the
// indexed bytes but drops `length`/`byteLength` entirely. Any consumer that
// needs to know how many bytes came back (e.g. `crypto.subtle.digest`) ends
// up reading `length` as `undefined` and hashing zero bytes.
//
// This module performs the same encode/decode bridging, but marshals bytes
// with the same helpers the crypto module already relies on, which do
// preserve `byteLength`/real array semantics.
const TEXT_ENCODING_POLYFILL_SRC = `
(function (hostTextEncoderEncode, hostTextDecoderCreate, hostTextDecoderDecode) {
  "use strict";

  function TextEncoder() {}

  TextEncoder.prototype.encode = function (input) {
    if (input === undefined) input = "";
    return hostTextEncoderEncode(String(input));
  };

  Object.defineProperty(TextEncoder.prototype, "encoding", {
    value: "utf-8",
    writable: false,
    enumerable: true,
    configurable: false,
  });

  function TextDecoder(label, options) {
    if (label === undefined) label = "utf-8";
    if (options === undefined) options = {};

    this.__decoderId = hostTextDecoderCreate(
      label,
      Boolean(options.fatal),
      Boolean(options.ignoreBOM)
    );
    this.__encoding = String(label).toLowerCase();
    this.__fatal = Boolean(options.fatal);
    this.__ignoreBOM = Boolean(options.ignoreBOM);
  }

  TextDecoder.prototype.decode = function (input, options) {
    if (options === undefined) options = {};
    return hostTextDecoderDecode(
      this.__decoderId,
      input,
      Boolean(options.stream)
    );
  };

  Object.defineProperty(TextDecoder.prototype, "encoding", {
    get: function () {
      return this.__encoding;
    },
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(TextDecoder.prototype, "fatal", {
    get: function () {
      return this.__fatal;
    },
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(TextDecoder.prototype, "ignoreBOM", {
    get: function () {
      return this.__ignoreBOM;
    },
    enumerable: true,
    configurable: false,
  });

  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
})
`

export const customEncodingModule = (config: CustomEncodingModuleConfig = {}) =>
  defineCageModule((ctx) => {
    const TextEncoderImpl = config.textEncoderImpl ?? globalThis.TextEncoder
    const TextDecoderImpl = config.textDecoderImpl ?? globalThis.TextDecoder

    if (!TextEncoderImpl) {
      throw new Error(
        "TextEncoder is not available in this environment. Please provide a custom implementation via textEncoderImpl."
      )
    }
    if (!TextDecoderImpl) {
      throw new Error(
        "TextDecoder is not available in this environment. Please provide a custom implementation via textDecoderImpl."
      )
    }

    const hostEncoder = new TextEncoderImpl()
    const decoders = new Map<number, InstanceType<typeof TextDecoderImpl>>()
    let nextDecoderId = 1

    // crypto.subtle.digest() and every other byte-array consumer in this
    // sandbox expect the shape produced by uint8ArrayToVmArray (a real VM
    // array with a byteLength prop) - not whatever faraday-cage's generic
    // marshaller happens to produce for a Uint8Array.
    const encodeFn = defineSandboxFunctionRaw(
      ctx,
      "__hostTextEncoderEncode",
      (...args) => {
        const str = (ctx.vm.dump(args[0]) as string | undefined) ?? ""
        const bytes = hostEncoder.encode(String(str))
        return uint8ArrayToVmArray(ctx, bytes)
      }
    )

    const createDecoderFn = defineSandboxFunctionRaw(
      ctx,
      "__hostTextDecoderCreate",
      (...args) => {
        const label = ctx.vm.dump(args[0]) as string
        const fatal = ctx.vm.dump(args[1]) as boolean
        const ignoreBOM = ctx.vm.dump(args[2]) as boolean

        try {
          const decoder = new TextDecoderImpl(label, { fatal, ignoreBOM })
          const id = nextDecoderId++
          decoders.set(id, decoder)
          return ctx.scope.manage(ctx.vm.newNumber(id))
        } catch (e) {
          throw e instanceof Error ? e : new Error(String(e))
        }
      }
    )

    const decodeFn = defineSandboxFunctionRaw(
      ctx,
      "__hostTextDecoderDecode",
      (...args) => {
        const id = ctx.vm.dump(args[0]) as number
        const inputHandle = args[1]
        const stream = ctx.vm.dump(args[2]) as boolean

        const decoder = decoders.get(id)
        if (!decoder) {
          throw new Error("Invalid TextDecoder instance")
        }

        const bytes =
          inputHandle && ctx.vm.typeof(inputHandle) !== "undefined"
            ? vmArrayToUint8Array(ctx, inputHandle)
            : undefined

        const result = decoder.decode(bytes, { stream })
        return ctx.scope.manage(ctx.vm.newString(result))
      }
    )

    const polyfillFn = ctx.scope.manage(
      ctx.vm.unwrapResult(ctx.vm.evalCode(TEXT_ENCODING_POLYFILL_SRC))
    )

    ctx.vm.unwrapResult(
      ctx.vm.callFunction(
        polyfillFn,
        ctx.vm.undefined,
        encodeFn,
        createDecoderFn,
        decodeFn
      )
    )
  })
