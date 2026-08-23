import OBR, { type Metadata, type Player } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readRoomState, type Participant } from "../domain";
import { applyOwlbearTheme } from "../theme";

export type ConnectionStatus = "connecting" | "ready" | "error";

export function usePingRoom() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [role, setRole] = useState<"GM" | "PLAYER">("PLAYER");
  const [currentPlayer, setCurrentPlayer] = useState<Participant>({ id: "", name: "" });
  const [players, setPlayers] = useState<Participant[]>([]);
  const [metadata, setMetadata] = useState<Metadata>({});
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);

  const setParty = useCallback((party: Player[], self: Participant) => {
    const all = [self, ...party.map((player) => ({ id: player.id, name: player.name || "Unnamed player" }))];
    setPlayers(all.filter((player, index) => all.findIndex((candidate) => candidate.id === player.id) === index));
  }, []);

  const refresh = useCallback(async () => {
    const [nextRole, name, party, roomMetadata] = await Promise.all([OBR.player.getRole(), OBR.player.getName(), OBR.party.getPlayers(), OBR.room.getMetadata()]);
    if (!active.current) return;
    const self = { id: OBR.player.id, name: name || "Unnamed player" };
    setRole(nextRole); setCurrentPlayer(self); setParty(party, self); setMetadata(roomMetadata); setError(null); setStatus("ready");
  }, [setParty]);

  useEffect(() => {
    active.current = true;
    const cleanups: Array<() => void> = [];
    const timeout = window.setTimeout(() => { if (active.current) { setError("Open Ping inside an Owlbear Rodeo room."); setStatus("error"); } }, 8000);
    if (!OBR.isAvailable) {
      window.clearTimeout(timeout); setError("Open Ping inside an Owlbear Rodeo room."); setStatus("error");
      return () => { active.current = false; };
    }
    OBR.onReady(async () => {
      if (!active.current) return;
      window.clearTimeout(timeout);
      try {
        try { applyOwlbearTheme(await OBR.theme.getTheme()); cleanups.push(OBR.theme.onChange(applyOwlbearTheme)); } catch { /* CSS fallbacks remain usable. */ }
        cleanups.push(OBR.room.onMetadataChange(setMetadata));
        cleanups.push(OBR.party.onChange(() => void refresh()));
        cleanups.push(OBR.player.onChange(() => void refresh()));
        await refresh();
      } catch (cause) { if (active.current) { setError(cause instanceof Error ? cause.message : "Unable to connect to Owlbear Rodeo."); setStatus("error"); } }
    });
    return () => { active.current = false; window.clearTimeout(timeout); cleanups.splice(0).forEach((cleanup) => cleanup()); };
  }, [refresh, setParty]);

  const room = useMemo(() => readRoomState(metadata), [metadata]);
  return { status, role, currentPlayer, players, metadata, error, refresh, ...room };
}
