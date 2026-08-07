import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Живая активность: таймер на экране блокировки и в Dynamic Island.
 *
 * Всё, что здесь передаётся, — это момент окончания фазы. Отсчёт рисует
 * сама iOS, поэтому пока сессия идёт ровно, обновлять активность не нужно
 * вообще: ни при сворачивании, ни раз в секунду. Зовём только на смену
 * состояния — старт, пауза, сброс, новая фаза.
 */

export type LiveState = {
  /** Момент окончания фазы, секунды эпохи */
  endsAt: number;
  /** Начало текущего отрезка — от него система ведёт дугу */
  startedAt: number;
  running: boolean;
  /** Остаток на паузе, секунды */
  leftSeconds: number;
  phase: string;
  deep: boolean;
};

/** То же плюс метка времени последнего действия с экрана блокировки */
export type SharedState = LiveState & { stamp: number };

declare class LiveActivityNativeModule extends NativeModule {
  isSupported(): boolean;
  start(state: LiveState): boolean;
  update(state: LiveState): void;
  end(): void;
  readShared(): SharedState | null;
}

/**
 * Модуль только для iOS, и на устройствах старше iOS 16.2 его функции
 * ничего не делают. Опциональная загрузка — чтобы отсутствие сборки
 * с расширением не роняло приложение целиком.
 */
const native = requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivity');

const available = Platform.OS === 'ios' && native != null;

export function isSupported(): boolean {
  return available ? native!.isSupported() : false;
}

export function start(state: LiveState): boolean {
  return available ? native!.start(state) : false;
}

export function update(state: LiveState): void {
  if (available) native!.update(state);
}

export function end(): void {
  if (available) native!.end();
}

export function readShared(): SharedState | null {
  return available ? native!.readShared() : null;
}
