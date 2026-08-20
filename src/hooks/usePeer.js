import { useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { PEER_BROKERS, ICE_SERVERS } from '../engine/constants.js';

let _brokerIdx = 0;
let _brokerDownCount = 0;

export function brokerForCode(code) {
  const s = String(code || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % PEER_BROKERS.length;
}

export function peerConfig(brokerIdx) {
  const b = PEER_BROKERS[brokerIdx] || PEER_BROKERS[0];
  return {
    host: b.host,
    port: b.port,
    path: '/',
    secure: true,
    debug: 0,
    config: { iceServers: ICE_SERVERS }
  };
}

export function currentBrokerName() {
  const b = PEER_BROKERS[_brokerIdx] || PEER_BROKERS[0];
  return b.host;
}

export function brokerDown() {
  _brokerDownCount += 1;
  _brokerIdx = (_brokerIdx + 1) % PEER_BROKERS.length;
  return _brokerDownCount < PEER_BROKERS.length * 2;
}

export function resetBrokerCounters() {
  _brokerDownCount = 0;
}

export function usePeer() {
  const peersRef = useRef(new Set());

  const makePeer = useCallback((id, opts = {}) => {
    return new Promise((resolve, reject) => {
      const brokerIdx = opts.broker !== undefined ? opts.broker : _brokerIdx;
      let settled = false;
      const peer = new Peer(id, peerConfig(brokerIdx));

      const watchdog = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          peer.destroy();
        } catch (e) {}
        peersRef.current.delete(peer);
        if (opts.onBrokerDown) opts.onBrokerDown();
        reject(new Error('peer_open_timeout'));
      }, opts.timeout || 9000);

      peer.on('open', (pid) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        peersRef.current.add(peer);
        resolve(peer);
      });

      peer.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        try {
          peer.destroy();
        } catch (e) {}
        if (opts.onBrokerDown && ['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
          opts.onBrokerDown();
        }
        reject(err);
      });
    });
  }, []);

  const destroyPeer = useCallback((peer) => {
    if (!peer) return;
    peersRef.current.delete(peer);
    try {
      peer.destroy();
    } catch (e) {}
  }, []);

  const destroyAll = useCallback(() => {
    peersRef.current.forEach((p) => {
      try {
        p.destroy();
      } catch (e) {}
    });
    peersRef.current.clear();
  }, []);

  return { makePeer, destroyPeer, destroyAll };
}