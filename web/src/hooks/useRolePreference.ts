import { useEffect, useState } from "react";

export type RolePref = "passenger" | "driver";

const STORAGE_KEY = "pp_role";

export function getStoredRole(): RolePref {
  if (typeof localStorage === "undefined") return "passenger";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "driver" ? "driver" : "passenger";
}

export function useRolePreference(): {
  role: RolePref;
  setRole: (r: RolePref) => void;
} {
  const [role, setRoleState] = useState<RolePref>(() => getStoredRole());

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRoleState(getStoredRole());
    };
    window.addEventListener("storage", handler);
    const local = () => setRoleState(getStoredRole());
    window.addEventListener("pp-role-change", local);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("pp-role-change", local);
    };
  }, []);

  const setRole = (r: RolePref) => {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
    window.dispatchEvent(new Event("pp-role-change"));
  };

  return { role, setRole };
}
