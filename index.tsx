/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Nays
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { copyWithToast, getCurrentGuild } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Message, User } from "@vencord/discord-types";
import { ApplicationCommandInputType, ApplicationCommandType } from "@vencord/discord-types/enums";
import { findStoreLazy } from "@webpack";
import { ChannelStore, ContextMenuApi, GuildRoleStore, Menu, SelectedChannelStore } from "@webpack/common";
import type { MouseEvent } from "react";

const COPY_ID = "devmode-copy-id";
const ITEM_ID = "vc-copy-mention";

const CommandIndexStore = findStoreLazy("ApplicationCommandIndexStore");
const ApplicationCommandStore = findStoreLazy("ApplicationCommandStore");

interface AppCommand {
    untranslatedName: string;
    inputType: ApplicationCommandInputType;
    type: ApplicationCommandType;
    rootCommand?: { id: string; };
}

interface Mention {
    label: string;
    mention: string;
    name: string;
}

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
        description: "Add 'Copy Role Mention' to role context menus (needs developer mode)",
        type: OptionType.BOOLEAN,
        default: true
    },
    commands: {
        description: "Add 'Copy Command Mention' to slash commands in the command picker and to command replies",
        type: OptionType.BOOLEAN,
        default: true
    }
});

function MentionIcon({ className }: { className?: string; }) {
    return (
        <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <mask id="vc-copy-mention-back">
                <rect width="24" height="24" fill="white" />
                <rect x="3" y="9" width="22" height="14" rx="5" fill="black" />
            </mask>
            <mask id="vc-copy-mention-front">
                <rect width="24" height="24" fill="white" />
                <path d="M11.5 13.5 9.5 16l2 2.5M16.5 13.5l2 2.5-2 2.5" fill="none" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </mask>
            <rect x="2" y="4" width="17" height="10" rx="3.5" fill="none" stroke="currentColor" strokeWidth="2" mask="url(#vc-copy-mention-back)" />
            <rect x="5" y="11" width="18" height="10" rx="3.5" mask="url(#vc-copy-mention-front)" />
        </svg>
    );
}

function mentionItem({ label, mention, name }: Mention) {
    return (
        <Menu.MenuItem
            id={ITEM_ID}
            label={label}
            action={() => copyWithToast(mention, `Copied ${name} mention`)}
            icon={MentionIcon}
            leadingAccessory={{ type: "icon", icon: MentionIcon }}
        />
    );
}

function addMentionItem(children: Parameters<NavContextMenuPatchCallback>[0], mention: Mention | null) {
    if (!mention) return;

    const item = mentionItem(mention);

    const group = findGroupChildrenByChildId(COPY_ID, children, true);
    if (!group) {
        children.push(item);
        return;
    }

    group.splice(group.findIndex(child => child?.props?.id?.includes(COPY_ID)) + 1, 0, item);
}

function commandMention(command: AppCommand | null | undefined): Mention | null {
    if (command?.inputType !== ApplicationCommandInputType.BOT || command.type !== ApplicationCommandType.CHAT_INPUT || !command.rootCommand) return null;

    return {
        label: "Copy Command Mention",
        mention: `</${command.untranslatedName}:${command.rootCommand.id}>`,
        name: `/${command.untranslatedName}`
    };
}

function findCommand(channel: Channel, applicationId: string, name: string): AppCommand | undefined {
    const states = [
        CommandIndexStore.getContextState({ type: "channel", channel }),
        CommandIndexStore.getUserState()
    ];

    for (const { result } of states) {
        const commands: Record<string, AppCommand> | undefined = result?.sections[applicationId]?.commands;
        if (!commands) continue;

        const command = Object.values(commands).find(command => command.untranslatedName === name);
        if (command) return command;
    }
}

function openCommandMenu(event: MouseEvent, command?: AppCommand) {
    if (!settings.store.commands) return;

    const mention = commandMention(command);
    if (!mention) return;

    ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu
            navId="vc-copy-mention-command"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Command Actions"
        >
            {mentionItem(mention)}
        </Menu.Menu>
    ));
}

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: { user: User; }) => {
    if (!settings.store.users || !user) return;

    addMentionItem(children, {
        label: user.bot ? "Copy Bot Mention" : "Copy User Mention",
        mention: `<@${user.id}>`,
        name: `@${user.globalName ?? user.username}`
    });
};

const patchChannelContext: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel; }) => {
    if (!settings.store.channels || !channel || channel.isPrivate() || channel.isCategory()) return;

    addMentionItem(children, {
        label: channel.isThread() ? "Copy Thread Mention" : "Copy Channel Mention",
        mention: `<#${channel.id}>`,
        name: `#${channel.name}`
    });
};

const patchMessageContext: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!settings.store.commands) return;

    const interaction = message?.interactionMetadata;
    if (interaction?.command_type !== ApplicationCommandType.CHAT_INPUT || !interaction.name || !message.applicationId) return;

    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel) return;

    addMentionItem(children, commandMention(findCommand(channel, message.applicationId, interaction.name)));
};

const patchDevContext: NavContextMenuPatchCallback = (children, { id }: { id: string; }) => {
    const command: AppCommand | null = ApplicationCommandStore.getActiveCommand(SelectedChannelStore.getChannelId());
    if (command?.rootCommand?.id === id) {
        if (settings.store.commands) addMentionItem(children, commandMention(command));
        return;
    }

    if (!settings.store.roles) return;

    const guild = getCurrentGuild();
    if (!guild) return;

    const role = GuildRoleStore.getRole(guild.id, id);
    if (!role) return;

    addMentionItem(children, {
        label: "Copy Role Mention",
        mention: `<@&${role.id}>`,
        name: `@${role.name}`
    });
};

export default definePlugin({
    name: "CopyMentions",
    description: "Adds options to copy user, channel, thread, role and slash command mentions from their context menus",
    authors: [{ name: "Nays", id: 344871509677965313n }],
    tags: ["Utility", "Roles"],
    settings,

    patches: [
        {
            find: "AutocompleteRow: renderContent must be extended",
            replacement: {
                match: /onClick:this\.handleClick,/,
                replace: "$&onContextMenu:event=>$self.openCommandMenu(event,this.props.command),"
            }
        }
    ],

    openCommandMenu,

    contextMenus: {
        "user-context": patchUserContext,
        "user-profile-overflow-menu": patchUserContext,
        "channel-context": patchChannelContext,
        "thread-context": patchChannelContext,
        "message": patchMessageContext,
        "dev-context": patchDevContext
    }
});
