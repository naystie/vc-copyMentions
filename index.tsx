/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nays
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { copyWithToast, getCurrentGuild } from "@utils/discord";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import type { Channel, User } from "@vencord/discord-types";
import { GuildRoleStore, Menu } from "@webpack/common";
import type { ReactElement } from "react";

const COPY_ID = "devmode-copy-id";
const ITEM_ID = "vc-copy-mention";

const AtIcon: IconComponent = ({ height = 24, width = 24, className }) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M16.44 6.96c.29 0 .51.25.47.54l-.82 6.34c-.02.08-.03.2-.03.34 0 .71.28 1.07.85 1.07.49 0 .94-.21 1.36-.63.43-.42.77-1 1.02-1.72.26-.75.38-1.57.38-2.48 0-1.35-.29-2.54-.87-3.56a5.92 5.92 0 0 0-2.45-2.35 7.68 7.68 0 0 0-3.61-.83c-1.55 0-2.96.37-4.22 1.1a7.66 7.66 0 0 0-2.96 3.07 9.53 9.53 0 0 0-1.09 4.66c0 1.45.26 2.77.78 3.95a6.3 6.3 0 0 0 2.47 2.81 8.3 8.3 0 0 0 4.36 1.05 12.43 12.43 0 0 0 5.35-1.18.5.5 0 0 1 .7.24l.46 1.07c.1.22.02.47-.19.59-.77.43-1.69.77-2.75 1.02-1.23.3-2.48.44-3.76.44-2.18 0-4-.44-5.48-1.33a8.1 8.1 0 0 1-3.27-3.57 11.93 11.93 0 0 1-1.07-5.12c0-2.24.47-4.19 1.4-5.84a9.7 9.7 0 0 1 3.86-3.8c1.62-.9 3.4-1.34 5.36-1.34 1.8 0 3.4.37 4.8 1.12 1.4.72 2.5 1.76 3.28 3.1a8.86 8.86 0 0 1 1.16 4.56c0 1.36-.23 2.57-.7 3.64a5.81 5.81 0 0 1-1.92 2.47c-.82.58-1.76.87-2.81.87a2.4 2.4 0 0 1-1.6-.5c-.4-.35-.65-.78-.73-1.32-.3.55-.74 1-1.36 1.34a4.3 4.3 0 0 1-2.03.48A3.4 3.4 0 0 1 8 16C7.33 15.16 7 14 7 12.5c0-1.14.2-2.16.6-3.05.43-.89 1-1.57 1.73-2.06a4.3 4.3 0 0 1 4.27-.31c.47.29.82.68 1.07 1.16l.3-.95c.06-.2.25-.33.46-.33h1.02Zm-5.06 8.24c.8 0 1.45-.35 1.97-1.04.51-.7.77-1.6.77-2.7 0-.88-.18-1.56-.53-2.03a1.76 1.76 0 0 0-1.5-.73c-.8 0-1.45.35-1.97 1.04a4.28 4.28 0 0 0-.78 2.67c0 .9.17 1.58.51 2.06.36.49.87.73 1.53.73Z"
        />
    </svg>
);

const ChannelIcon: IconComponent = ({ height = 24, width = 24, className }) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z"
        />
    </svg>
);

const settings = definePluginSettings({
    users: {
        description: "Add 'Copy User Mention' to user context menus",
        type: OptionType.BOOLEAN,
        default: true
    },
    channels: {
        description: "Add 'Copy Channel Mention' to channel context menus",
        type: OptionType.BOOLEAN,
        default: true
    },
    threads: {
        description: "Add 'Copy Thread Mention' to thread context menus",
        type: OptionType.BOOLEAN,
        default: true
    },
    roles: {
        description: "Add 'Copy Role Mention' to role context menus",
        type: OptionType.BOOLEAN,
        default: true
    }
});

function addMentionItem(children: Array<ReactElement<any> | null>, label: string, mention: string, name: string, icon: IconComponent) {
    const item = (
        <Menu.MenuItem
            id={ITEM_ID}
            label={label}
            action={() => copyWithToast(mention, `Copied ${name} mention`)}
            icon={icon}
            leadingAccessory={{ type: "icon", icon }}
        />
    );

    const group = findGroupChildrenByChildId(COPY_ID, children, true);
    if (!group) {
        children.push(item);
        return;
    }

    group.splice(group.findIndex(child => child?.props?.id?.includes(COPY_ID)) + 1, 0, item);
}

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: { user: User; }) => {
    if (!settings.store.users || !user) return;

    addMentionItem(
        children,
        user.bot ? "Copy Bot Mention" : "Copy User Mention",
        `<@${user.id}>`,
        `@${user.globalName ?? user.username}`,
        AtIcon
    );
};

const patchChannelContext: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!channel || channel.isPrivate()) return;

    const isThread = channel.isThread();
    if (!(isThread ? settings.store.threads : settings.store.channels)) return;

    addMentionItem(
        children,
        isThread ? "Copy Thread Mention" : "Copy Channel Mention",
        `<#${channel.id}>`,
        channel.name,
        ChannelIcon
    );
};

const patchDevContext: NavContextMenuPatchCallback = (children, { id }: { id: string; }) => {
    if (!settings.store.roles) return;

    const guild = getCurrentGuild();
    if (!guild) return;

    const role = GuildRoleStore.getRole(guild.id, id);
    if (!role) return;

    addMentionItem(
        children,
        "Copy Role Mention",
        `<@&${role.id}>`,
        `@${role.name}`,
        AtIcon
    );
};

export default definePlugin({
    name: "CopyMentions",
    description: "Adds options to copy user, channel, thread and role mentions from their context menus.",
    authors: [{ name: "Nays", id: 344871509677965313n }],
    tags: ["Utility", "Roles"],
    settings,

    contextMenus: {
        "user-context": patchUserContext,
        "user-profile-actions": patchUserContext,
        "user-profile-overflow-menu": patchUserContext,
        "channel-context": patchChannelContext,
        "thread-context": patchChannelContext,
        "dev-context": patchDevContext
    }
});
