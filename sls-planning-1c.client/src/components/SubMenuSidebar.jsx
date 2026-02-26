import React from 'react';

const SubMenuSidebar = ({ currentSubMenu, activeSubItem, onSubMenuClick }) => {
    if (currentSubMenu.length === 0) {
        return null;
    }

    return (
        <aside className="sidebar">
            {currentSubMenu.map((item, index) => (
                <button
                    key={item}
                    className={`side-btn ${activeSubItem === index ? 'active' : ''}`}
                    onClick={() => onSubMenuClick(item, index)}
                >
                    {item}
                </button>
            ))}
        </aside>
    );
};

export default SubMenuSidebar;
