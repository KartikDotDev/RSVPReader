import { useEffect, useRef } from 'react';

function usePreciseInterval(callback, delay, running) {
    const savedCallback = useRef();
    const intervalId = useRef(null);
    const expectedTime = useRef(null);

    // Remember the latest callback.
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Set up the interval.
    useEffect(() => {
        function tick() {
            if (savedCallback.current) {
                savedCallback.current();
            }
        }

        if (running && delay !== null) {
            // For the first tick, schedule it directly
            expectedTime.current = Date.now() + delay;
            intervalId.current = setTimeout(function internalTick() {
                const drift = Date.now() - expectedTime.current;
                tick(); // Execute callback

                // Reschedule, adjusting for drift
                if (running && delay !== null) { // Check running again, might have changed
                    expectedTime.current += delay;
                    intervalId.current = setTimeout(internalTick, Math.max(0, delay - drift));
                }
            }, delay);

            return () => {
                if (intervalId.current) clearTimeout(intervalId.current);
            };
        } else {
            if (intervalId.current) clearTimeout(intervalId.current);
        }
    }, [delay, running]);

    // Function to manually clear the interval if needed from outside
    const clearIntervalManual = () => {
        if (intervalId.current) {
            clearTimeout(intervalId.current);
            intervalId.current = null;
        }
    };

    return { clearIntervalManual };
}

export default usePreciseInterval;