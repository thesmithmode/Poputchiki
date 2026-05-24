import { createContext } from "react";
import type { MeState } from "../hooks/useMe";

export const MeContext = createContext<MeState | null>(null);
