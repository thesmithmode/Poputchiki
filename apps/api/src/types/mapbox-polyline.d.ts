declare module "@mapbox/polyline" {
  function decode(str: string, precision?: number): [number, number][];
  function encode(coordinates: [number, number][], precision?: number): string;
  const _default: { decode: typeof decode; encode: typeof encode };
  export = _default;
}
