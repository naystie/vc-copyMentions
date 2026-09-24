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
            <mask id="vc-copy-mention-icon">
                <rect width="24" height="24" fill="white" />
                <g fill="none" stroke="black" strokeWidth="1.6" strokeLinecap="round">
                    <circle cx="14" cy="14" r="2" />
                    <path d="M16 12.25v2.5a1.6 1.6 0 0 0 3.2 0V14a5.2 5.2 0 1 0-2.1 4.18" />
                </g>
            </mask>
            <path d="M3 16a1 1 0 0 1-1-1V8a6 6 0 0 1 6-6h7a1 1 0 0 1 0 2H8a4 4 0 0 0-4 4v7a1 1 0 0 1-1 1Z" />
            <rect x="6" y="6" width="16" height="16" rx="4" mask="url(#vc-copy-mention-icon)" />
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
    description: "Adds options to copy user, channel, thread, role and slash command mentions from their context menus.",
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
