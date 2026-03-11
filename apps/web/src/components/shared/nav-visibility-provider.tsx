"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface NavVisibilityContextValue {
	isNavHidden: boolean;
	setNavHidden: (hidden: boolean) => void;
}

const NavVisibilityContext = createContext<NavVisibilityContextValue | null>(null);

export function NavVisibilityProvider({ children }: { children: ReactNode }) {
	const [isNavHidden, setIsNavHidden] = useState(false);

	const setNavHidden = useCallback((hidden: boolean) => {
		setIsNavHidden(hidden);
	}, []);

	return (
		<NavVisibilityContext.Provider value={{ isNavHidden, setNavHidden }}>
			{children}
		</NavVisibilityContext.Provider>
	);
}

export function useNavVisibility() {
	const context = useContext(NavVisibilityContext);
	if (!context) {
		return { isNavHidden: false, setNavHidden: () => {} };
	}
	return context;
}
