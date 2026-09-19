/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nays
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { copyWithToast, getCurrentGuild } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, User } from "@vencord/discord-types";
import { findComponentByCodeLazy } from "@webpack";
import { GuildRoleStore, Menu } from "@webpack/common";
import type { ComponentType } from "react";

const COPY_ID = "devmode-copy-id";
const ITEM_ID = "vc-copy-mention";

const AtIcon = findComponentByCodeLazy("M16.44 6.96c.29");
const TextIcon = findComponentByCodeLazy("M10.99 3.16A1 1 0 1 0 9 2.84");
const SpeakerIcon = findComponentByCodeLazy("M15.16 16.51c-.57.28");

const settings = definePluginSettings({
    users: {
        description: "Add 'Copy User Mention' to user context menus",
        type: OptionType.BOOLEAN,
        default: true
    },
    channels: {
        description: "Add 'Copy Channel Mention' to channel and thread context menus",
        type: OptionType.BOOLEAN,
        default: true
    },
    roles: {
        description: "Add 'Copy Role Mention' to role context menus. Needs Developer Mode, roles have no menu without it",
        type: OptionType.BOOLEAN,
        default: true
    }
});

function addMentionItem(children: Parameters<NavContextMenuPatchCallback>[0], label: string, mention: string, name: string, icon: ComponentType) {
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
    if (!settings.store.channels || !channel || channel.isPrivate() || channel.isCategory()) return;

    addMentionItem(
        children,
        channel.isThread() ? "Copy Thread Mention" : "Copy Channel Mention",
        `<#${channel.id}>`,
        `#${channel.name}`,
        channel.isGuildVocal() ? SpeakerIcon : TextIcon
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
