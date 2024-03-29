import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Inject,
	Post,
	Req,
	Res,
	UseGuards,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { Request, Response } from 'express';
import { IUserService } from 'src/users/interfaces/user';
import { Routes, Services } from 'src/utils/constants';
import { IAuthService } from './auth';
import { CreateUserDto } from './dtos/CreateUser.dto';
import { AuthenticatedGuard, LocalAuthGuard } from './utils/Guards';
import { AuthenticatedRequest } from 'src/utils/types';

@Controller(Routes.AUTH)
export class AuthController {
	constructor(
		@Inject(Services.AUTH) private authService: IAuthService,
		@Inject(Services.USERS) private userService: IUserService,
	) { }

	@Post('register')
	async registerUser(@Body() createUserDto: CreateUserDto) {
		return instanceToPlain(await this.userService.createUser(createUserDto));
	}

	@UseGuards(LocalAuthGuard)
	@Post('login')
	login(@Res() res: Response) {
		return res.send(HttpStatus.OK);
	}

	@Get('status')
	@UseGuards(AuthenticatedGuard)
	status(@Req() req: Request, @Res() res: Response) {
		res.send(req.user);
	}

	@Post('logout')
	@UseGuards(AuthenticatedGuard)
	logout(@Req() req: AuthenticatedRequest, @Res() res: Response) {
		req.session.destroy((err) => {
			return err ? res.send(400) : res.send(200);
		});
	}
}
