import { Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { 
	WebSocketGateway, 
	WebSocketServer,
	SubscribeMessage, 
	MessageBody, 
	OnGatewayConnection,
	ConnectedSocket,
	OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { IConversationsService } from 'src/conversations/conversations';
import { IGroupService } from '../groups/interfaces/group';
import { Services } from 'src/utils/constants';
import { AuthenticatedSocket } from 'src/utils/interfaces';
import { 
	Conversation, 
	Group, 
	GroupMessage, 
	Message,
} from 'src/utils/typeorm';
import { 
	AddGroupUserResponse,
	CreateGroupMessageResponse, 
	CreateMessageResponse, 
	RemoveGroupUserResponse,
} from 'src/utils/types';
import { IFriendsService } from 'src/friends/friends';
import { IGatewaySessionManager } from './gateway.session';

@WebSocketGateway({
	cors: {
		origin: ['http://localhost:3000'],
		credentials: true,
	},
	pingInterval: 10000,
	pingTimeout: 15000,
})
export class MessagingGateway 
	implements OnGatewayConnection, OnGatewayDisconnect 
{
	constructor(
		@Inject(Services.GATEWAY_SESSION_MANAGER) 
		readonly sessions: IGatewaySessionManager,
		@Inject(Services.CONVERSATIONS)
		private readonly conversationService: IConversationsService,
		@Inject(Services.GROUPS)
		private readonly groupsService: IGroupService,
		@Inject(Services.FRIENDS_SERVICE)
		private readonly friendsService: IFriendsService,
	) {}

	@WebSocketServer()
	server: Server;

	handleConnection(socket: AuthenticatedSocket, ...args: any[]) {
		console.log('Incoming Connection');
		this.sessions.setUserSocket(socket.user.id, socket);
		socket.emit('connected', {});
	}

	handleDisconnect(socket: AuthenticatedSocket) {
		console.log('handleDisconnect');
		console.log(`${socket.user.username} disconnected.`);
		this.sessions.removeUserSocket(socket.user.id);
	}

	@SubscribeMessage('getOnlineGroupUsers')
	async handleGetOnlineGroupUsers(
		@MessageBody() data: any, 
		@ConnectedSocket() socket: AuthenticatedSocket,
	) {
		const group = await this.groupsService.findGroupById(
			parseInt(data.groupId),
		);
		if (!group) return;
		const onlineUsers= [];
		const offlineUsers = [];
		group.users.forEach((user) => {
			const socket = this.sessions.getUserSocket(user.id);
			socket ? onlineUsers.push(user) : offlineUsers.push(user);
		});
		socket.emit('onlineGroupUsersReceived', { onlineUsers, offlineUsers });
	}
	
	@SubscribeMessage('createMessage')
	handleCreateMessage(@MessageBody() data: any) {
		console.log('Create Message');
	}

	@SubscribeMessage('onConversationJoin')
	onConversationJoin(
		@MessageBody() data: any,
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		console.log(
			`${client.user?.id} joined a Conversation of ID: ${data.conversationId}`,
		);
		client.join(`conversation-${data.conversationId}`);
		console.log(client.rooms);
		client.to(`conversation-${data.conversationId}`).emit('userJoin');
	}

	@SubscribeMessage('onConversationLeave')
	onConversationLeave(
		@MessageBody() data: any,
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		console.log('onConversationLeave');
		client.join(`conversation-${data.conversationId}`);
		console.log(client.rooms);
		client.to(`conversation-${data.conversationId}`).emit('userLeave');
	}

	@SubscribeMessage('onGroupJoin')
	onGroupJoin(
		@MessageBody() data: any,
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		console.log('onGroupJoin');
		client.join(`group-${data.groupId}`);
		console.log(client.rooms);
		client.to(`group-${data.groupId}`).emit('userGroupJoin');
	}

	@SubscribeMessage('onGroupLeave')
	onGroupLeave(
		@MessageBody() data: any,
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		console.log('onGroupLeave');
		client.join(`group-${data.groupId}`);
		console.log(client.rooms);
		client.to(`group-${data.groupId}`).emit('userGroupLeave');
	}

	@SubscribeMessage('onTypingStart')
	onTypingStart(
		@MessageBody() data: any,
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		client.to(`conversation-${data.conversationId}`).emit('onTypingStart');
	}

	@SubscribeMessage('onTypingStop')
	onTypingStop(
		@MessageBody() data: any,
		@ConnectedSocket() client: AuthenticatedSocket,
	) {
		client.to(`conversation-${data.conversationId}`).emit('onTypingStop');
	}

	@OnEvent('message.create')
	handleMessageCreateEvent(payload: CreateMessageResponse) {
		const { 
			author, 
			conversation: { creator, recipient },
		} = payload.message;

		const authorSocket = this.sessions.getUserSocket(author.id);
		const recipientSocket = 
			author.id === creator.id 
				? this.sessions.getUserSocket(recipient.id) 
				: this.sessions.getUserSocket(creator.id);

		if (authorSocket) authorSocket.emit('onMessage', payload);
		if (recipientSocket) recipientSocket.emit('onMessage', payload);
	}

	@OnEvent('conversation.create')
	handleConversationCreateEvent(payload: Conversation) {
		const recipientSocket = this.sessions.getUserSocket(payload.recipient.id);
		if (recipientSocket) recipientSocket.emit('onConversation', payload);
	}

	@OnEvent('message.delete')
	async handleMessageDelete(payload) {
		const conversation = await this.conversationService.findById(
			payload.conversationId,
		);
		if (!conversation) return;
		const { creator, recipient } = conversation;
		const recipientSocket = 
			creator.id === payload.userId
				? this.sessions.getUserSocket(recipient.id)
				: this.sessions.getUserSocket(creator.id);
		if (recipientSocket) recipientSocket.emit('onMessageDelete', payload);
	}

	@OnEvent('message.update')
	async handleMessageUpdate(message: Message) {
		const {
			author,
			conversation: { creator, recipient },
		} = message;
		const recipientSocket = 
			author.id === creator.id
				? this.sessions.getUserSocket(recipient.id)
				: this.sessions.getUserSocket(creator.id);
		if (recipientSocket) recipientSocket.emit('onMessageUpdate', message);
	}

	@OnEvent('group.message.create')
	async handleGroupMessageCreate(payload: CreateGroupMessageResponse) {
		const { id } = payload.group;
		this.server.to(`group-${id}`).emit('onGroupMessage', payload);
	}

	@OnEvent('group.create')
	handleGroupCreate(payload: Group) {
		console.log('group.create event');
		payload.users.forEach((user) => {
			const socket = this.sessions.getUserSocket(user.id);
			socket && socket.emit('onGroupCreate', payload);
		});
	}

	@OnEvent('group.message.update')
	handleGroupMessageUpdate(payload: GroupMessage) {
		const room = `group-${payload.group.id}`;
		console.log(room);
		this.server.to(room).emit('onGroupMessageUpdate', payload);
	}

	@OnEvent('group.user.add')
	handdleGroupUserAdd(payload: AddGroupUserResponse) {
		const recipientSocket = this.sessions.getUserSocket(payload.user.id);
		console.log('inside group.user.add');
		console.log(`group-${payload.group.id}`);
		this.server
			.to(`group-${payload.group.id}`)
			.emit('onGroupReceivedNewUser', payload);
		recipientSocket && recipientSocket.emit('onGroupUserAdd', payload);
	}

	@OnEvent('group.user.remove')
	handleGroupUserRemove(payload: RemoveGroupUserResponse) {
		const { group, user } = payload;  
		const ROOM_NAME = `group-${payload.group.id}`;
		const removedUserSocket = this.sessions.getUserSocket(payload.user.id);
		console.log(payload);
		console.log('Inside group.user.remove');
		if (removedUserSocket) {
			console.log('Emitting onGroupRemove');
			removedUserSocket.emit('onGroupRemove', payload);
			removedUserSocket.leave(ROOM_NAME);
		}
		this.server.to(ROOM_NAME).emit('onGroupRecipientRemoved', payload);
		const onlineUsers = group.users
			.map((user) => this.sessions.getUserSocket(user.id) && user)
			.filter((user) => user);
		// this.server.to(ROOM_NAME).emit('onlineGroupUsersReceived', { onlineUsers });
	}

	@OnEvent('group.owner.update')
	handleGroupOwnerUpdate(payload: Group) {
		const ROOM_NAME = `group-${payload.id}`;
		const newOwnerSocket = this.sessions.getUserSocket(payload.owner.id);
		console.log('Inside group.owner.update');
		const { rooms } = this.server.sockets.adapter;
		console.log(rooms.get(ROOM_NAME));
		const socketsInRoom = rooms.get(ROOM_NAME);
		console.log('Sockets In Room');
		console.log(socketsInRoom);
		console.log(newOwnerSocket);
		// Check if the new owneer is in the group (room)
		this.server.to(ROOM_NAME).emit('onGroupOwnerUpdate', payload);
		if (newOwnerSocket && !socketsInRoom.has(newOwnerSocket.id)) {
			console.log('The new owneer is not in the room...');
			newOwnerSocket.emit('onGroupOwnerUpdate', payload);
		}
	}

	@OnEvent('group.user.leave')
	handleGroupUserLeaqve(payload) {
		console.log('inside group.user.leave');
		const ROOM_NAME = `group-${payload.group.id}`;
		const { rooms } = this.server.sockets.adapter;
		const socketsInRoom = rooms.get(ROOM_NAME);
		const leftUserSocket = this.sessions.getUserSocket(payload.userId);
		/**
		 * If socketsInRoom is undefined, this means that there is
		 * no one connected to the room. So just emit the event for
		 * the connected user if they re online.
		 */
		console.log(socketsInRoom);
		console.log(leftUserSocket);
		if (leftUserSocket && !socketsInRoom) {
			console.log('user is online, at latest 1 person is in the room');
			if (socketsInRoom.has(leftUserSocket.id)) {
				console.log('User is in room... room set has socket id');
				return this.server
					.to(ROOM_NAME)
					.emit('onGroupParticipantLeft', payload);
			} else {
				console.log('User is not in room, but someone is there');
				leftUserSocket.emit('onGroupParticipantLeft', payload);
				this.server.to(ROOM_NAME).emit('onGroupParticipantLeft', payload);
				return;
			}
		}
		if (!leftUserSocket && !socketsInRoom) {
			console.log('User is not online but there are no sockets in the room');
			return leftUserSocket.emit('onGroupParticipantLeft', payload);
		}
		if (leftUserSocket && !socketsInRoom) {
			console.log('User is online but there are no sockets in the room');
			return leftUserSocket.emit('onGroupParticipantLeft', payload);
		}
	}
	
	@SubscribeMessage('getOnlineFriends')
	async handleFriendListRetrieve(
		@MessageBody() data: any, 
		@ConnectedSocket() socket: AuthenticatedSocket,
	) {
		const { user } = socket;
		if (user) {
			console.log('user is authenticated');
			console.log(`fetching ${user.username}'s friends`);
			const friends = await this.friendsService.getFriends(user.id);
			const onlineFriends = friends.filter((friend) => 
				this.sessions.getUserSocket(
					user.id === friend.receiver.id
						? friend.sender.id
						: friend.receiver.id,
				),
			);
			socket.emit('getOnlineFriends', onlineFriends);
		}
	}
}
