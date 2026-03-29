/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import SpriteSlicer from './components/SpriteSlicer';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <SpriteSlicer />
    </ErrorBoundary>
  );
}
